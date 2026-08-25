import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * 全套 demo 共用的 LLM 请求/响应日志工具。
 *
 * 命名约定：YYYYMMDD-hhmmss-req.json / YYYYMMDD-hhmmss-resp.json
 * - 同一次调用的 req / resp 共享同一个时间戳前缀，方便配对查看
 * - 同一秒内发生多次调用时追加序号（如 20260825-143025-2-req.json）避免覆盖
 * - 设置环境变量 LLM_LOG_DIR 可以把所有日志统一重定向到同一个目录
 */
function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function makeLogBaseName(logDir) {
  const base = formatTimestamp(new Date());
  let candidate = base;
  let sequence = 2;

  while (
    fs.existsSync(path.join(logDir, `${candidate}-req.json`)) ||
    fs.existsSync(path.join(logDir, `${candidate}-resp.json`))
  ) {
    candidate = `${base}-${sequence}`;
    sequence += 1;
  }

  return candidate;
}

/**
 * 创建一次模型调用的日志会话。
 *
 * logDir：本次调用日志的默认目录（一般是各 demo 自己的 llm_logs）；
 * 若设置了环境变量 LLM_LOG_DIR，则所有日志统一重定向到那里。
 */
export function createLlmLogSession({ logDir } = {}) {
  const effectiveDir = process.env.LLM_LOG_DIR || logDir;
  if (!effectiveDir) {
    throw new Error("createLlmLogSession 需要 logDir，或设置环境变量 LLM_LOG_DIR。");
  }

  const baseName = makeLogBaseName(effectiveDir);

  return {
    baseName,
    async write(kind, data) {
      await fsp.mkdir(effectiveDir, { recursive: true });
      const filePath = path.join(effectiveDir, `${baseName}-${kind}.json`);
      await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
      return filePath;
    },
  };
}
