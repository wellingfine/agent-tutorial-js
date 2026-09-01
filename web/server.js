import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile, stat } from "node:fs/promises";

const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(WEB_DIR, "..");
const PUBLIC_DIR = path.join(WEB_DIR, "public");
const HOST = "127.0.0.1";
const requestedPort = Number.parseInt(process.env.PORT || "4173", 10);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
  ? requestedPort
  : 4173;
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const LOG_FILE_PATTERN = /^([A-Za-z0-9._-]+)-(req|resp)\.json$/;
const DEMO_PATTERN = /^demo([1-9]|1[01])$/;
const SESSION_PATTERN = /^[A-Za-z0-9._-]+$/;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function getDemoNames() {
  const entries = await readdir(PROJECT_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && DEMO_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

async function getLogFiles(demoName) {
  if (!DEMO_PATTERN.test(demoName)) return [];
  const logDir = path.join(PROJECT_ROOT, demoName, "llm_logs");
  try {
    const entries = await readdir(logDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && LOG_FILE_PATTERN.test(entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function compactText(value, limit) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

async function addSessionSummary(demoName, session) {
  const [requestLog, responseLog] = await Promise.all([
    session.request && session.request.bytes <= MAX_LOG_BYTES
      ? readLog(demoName, session.id, "req").catch(() => null)
      : null,
    session.response && session.response.bytes <= MAX_LOG_BYTES
      ? readLog(demoName, session.id, "resp").catch(() => null)
      : null,
  ]);
  const request = requestLog?.data;
  const response = responseLog?.data;
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  const userMessage = [...messages].reverse().find((message) => message?.role === "user");
  const assistantMessage = response?.choices?.[0]?.message;
  const input = compactText(userMessage?.content, 160);
  const output = compactText(assistantMessage?.content, 160);
  session.summary = {
    title: compactText(input || output || "模型调用", 54),
    summary: compactText(output || input || "等待查看日志内容", 100),
    searchText: compactText(`${input} ${output} ${request?.model || response?.model || ""}`, 360),
  };
  return session;
}

async function listSessions(demoName, { includeSummary = false } = {}) {
  const entries = await getLogFiles(demoName);
  const sessions = new Map();

  await Promise.all(entries.map(async (entry) => {
    const match = entry.name.match(LOG_FILE_PATTERN);
    if (!match) return;
    const [, id, kind] = match;
    const filePath = path.join(PROJECT_ROOT, demoName, "llm_logs", entry.name);
    const fileStat = await stat(filePath);
    const session = sessions.get(id) || {
      id,
      request: null,
      response: null,
      modifiedAt: 0,
      totalBytes: 0,
    };
    session[kind === "req" ? "request" : "response"] = {
      fileName: entry.name,
      bytes: fileStat.size,
      modifiedAt: fileStat.mtimeMs,
    };
    session.modifiedAt = Math.max(session.modifiedAt, fileStat.mtimeMs);
    session.totalBytes += fileStat.size;
    sessions.set(id, session);
  }));

  const result = [...sessions.values()].sort((a, b) => b.id.localeCompare(a.id));
  return includeSummary
    ? Promise.all(result.map((session) => addSessionSummary(demoName, session)))
    : result;
}

async function readLog(demoName, sessionId, kind) {
  const filePath = path.join(
    PROJECT_ROOT,
    demoName,
    "llm_logs",
    `${sessionId}-${kind}.json`,
  );
  const fileStat = await stat(filePath);
  if (fileStat.size > MAX_LOG_BYTES) {
    throw Object.assign(new Error("日志文件超过 10 MB 安全限制"), { statusCode: 413 });
  }
  const raw = await readFile(filePath, "utf8");
  try {
    return { data: JSON.parse(raw), parseError: null };
  } catch (error) {
    return { data: raw, parseError: error.message };
  }
}

async function handleApi(request, response, pathname) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "仅支持 GET 请求" });
    return;
  }

  if (pathname === "/api/demos") {
    const demos = await getDemoNames();
    const result = await Promise.all(demos.map(async (name) => {
      const sessions = await listSessions(name);
      return {
        name,
        number: Number(name.slice(4)),
        sessionCount: sessions.length,
        completeCount: sessions.filter((item) => item.request && item.response).length,
        latestAt: sessions[0]?.modifiedAt || null,
      };
    }));
    sendJson(response, 200, { demos: result });
    return;
  }

  const sessionsMatch = pathname.match(/^\/api\/demos\/(demo(?:[1-9]|1[01]))\/sessions$/);
  if (sessionsMatch) {
    const demoName = sessionsMatch[1];
    sendJson(response, 200, {
      demo: demoName,
      sessions: await listSessions(demoName, { includeSummary: true }),
    });
    return;
  }

  const detailMatch = pathname.match(
    /^\/api\/demos\/(demo(?:[1-9]|1[01]))\/sessions\/([A-Za-z0-9._-]+)$/,
  );
  if (detailMatch) {
    const [, demoName, sessionId] = detailMatch;
    if (!SESSION_PATTERN.test(sessionId)) {
      sendJson(response, 400, { error: "无效的日志会话 ID" });
      return;
    }
    const sessions = await listSessions(demoName);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) {
      sendJson(response, 404, { error: "日志会话不存在" });
      return;
    }
    const [requestLog, responseLog] = await Promise.all([
      session.request ? readLog(demoName, sessionId, "req") : null,
      session.response ? readLog(demoName, sessionId, "resp") : null,
    ]);
    sendJson(response, 200, {
      demo: demoName,
      session,
      request: requestLog,
      response: responseLog,
    });
    return;
  }

  sendJson(response, 404, { error: "API 不存在" });
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, requestedPath);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(response, 403, { error: "禁止访问" });
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    response.end(content);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") {
      sendJson(response, 404, { error: "页面不存在" });
      return;
    }
    throw error;
  }
}

export function createAppServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url.pathname);
      } else {
        await serveStatic(response, decodeURIComponent(url.pathname));
      }
    } catch (error) {
      const statusCode = error?.code === "ENOENT" ? 404 : error?.statusCode || 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? "读取日志时发生错误" : error.message,
      });
      if (statusCode === 500) console.error(error);
    }
  });
}

export { getDemoNames, listSessions, readLog };

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  createAppServer().listen(PORT, HOST, () => {
    console.log(`Agent Log Lens 已启动：http://${HOST}:${PORT}`);
    console.log(`正在读取：${PROJECT_ROOT}/demo*/llm_logs`);
  });
}
