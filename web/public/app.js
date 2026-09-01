const DEMO_TOPICS = {
  demo1: "最小 LLM 调用",
  demo2: "多轮对话与记忆",
  demo3: "Tool Calling",
  demo4: "规划与状态推进",
  demo5: "ReAct 循环",
  demo6: "Agent 框架",
  demo7: "Coding Agent",
  demo8: "Workflow Agent",
  demo9: "HITL Workflow",
  demo10: "RAG Agent",
  demo11: "MCP 工具接入",
};

const state = {
  demos: [],
  demo: null,
  sessions: [],
  session: null,
  detail: null,
  jsonKind: "request",
  view: "flow",
  search: "",
  treeSearch: "",
};

const elements = {
  demoList: document.querySelector("#demoList"),
  demoTotal: document.querySelector("#demoTotal"),
  currentDemoLabel: document.querySelector("#currentDemoLabel"),
  currentDemoTitle: document.querySelector("#currentDemoTitle"),
  sessionCount: document.querySelector("#sessionCount"),
  sessionList: document.querySelector("#sessionList"),
  sessionSearch: document.querySelector("#sessionSearch"),
  refreshButton: document.querySelector("#refreshButton"),
  emptyState: document.querySelector("#emptyState"),
  detailContent: document.querySelector("#detailContent"),
  detailDemo: document.querySelector("#detailDemo"),
  detailSession: document.querySelector("#detailSession"),
  detailTitle: document.querySelector("#detailTitle"),
  metricGrid: document.querySelector("#metricGrid"),
  flowView: document.querySelector("#flowView"),
  jsonView: document.querySelector("#jsonView"),
  jsonTree: document.querySelector("#jsonTree"),
  treeSearch: document.querySelector("#treeSearch"),
  expandSmartButton: document.querySelector("#expandSmartButton"),
  collapseAllButton: document.querySelector("#collapseAllButton"),
  toast: document.querySelector("#toast"),
};

function createElement(tag, options = {}, children = []) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = String(options.text);
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) element.setAttribute(key, value);
  }
  for (const child of children) {
    if (child !== null && child !== undefined) {
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  return element;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function formatTime(id) {
  const match = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!match) return id;
  return `${match[4]}:${match[5]}:${match[6]}`;
}

function formatDate(id) {
  const match = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!match) return id;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
}

function truncate(value, max = 100) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeParseEmbedded(value) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!text || !["{", "["].includes(text[0])) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function summarizeSession(detail) {
  const request = detail?.request?.data;
  const response = detail?.response?.data;
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  const user = [...messages].reverse().find((message) => message?.role === "user");
  const assistant = response?.choices?.[0]?.message;
  return {
    title: truncate(user?.content || assistant?.content || "模型调用", 48),
    summary: truncate(assistant?.content || user?.content || "等待查看日志内容", 92),
  };
}

async function loadDemos({ preserveSelection = false } = {}) {
  const result = await getJson("/api/demos");
  state.demos = result.demos;
  elements.demoTotal.textContent = result.demos.filter((demo) => demo.sessionCount > 0).length;
  renderDemos();

  const preferred = preserveSelection && state.demo
    ? state.demo
    : result.demos.find((demo) => demo.sessionCount > 0)?.name || result.demos[0]?.name;
  if (preferred) await selectDemo(preferred, { preserveSession: preserveSelection });
}

function renderDemos() {
  elements.demoList.replaceChildren();
  for (const demo of state.demos) {
    const button = createElement("button", {
      className: `demo-item${demo.name === state.demo ? " active" : ""}`,
      attrs: { type: "button", "data-demo": demo.name },
    }, [
      createElement("span", { className: "demo-number", text: String(demo.number).padStart(2, "0") }),
      createElement("span", { className: "demo-copy" }, [
        createElement("strong", { text: demo.name.toUpperCase() }),
        createElement("span", { text: DEMO_TOPICS[demo.name] || "Agent 教程" }),
      ]),
      createElement("span", { className: "demo-count", text: demo.sessionCount }),
    ]);
    button.addEventListener("click", () => selectDemo(demo.name));
    elements.demoList.append(button);
  }
}

async function selectDemo(demoName, { preserveSession = false } = {}) {
  const previousSession = preserveSession ? state.session : null;
  state.demo = demoName;
  state.session = null;
  state.detail = null;
  renderDemos();
  elements.currentDemoLabel.textContent = demoName.toUpperCase();
  elements.currentDemoTitle.textContent = DEMO_TOPICS[demoName] || "Agent 日志";
  showEmpty("正在载入调用记录…");

  const result = await getJson(`/api/demos/${encodeURIComponent(demoName)}/sessions`);
  if (state.demo !== demoName) return;
  state.sessions = result.sessions;
  elements.sessionCount.textContent = `${result.sessions.length} 次调用`;
  renderSessions();

  const target = result.sessions.find((session) => session.id === previousSession)?.id
    || result.sessions[0]?.id;
  if (target) await selectSession(target);
  else showEmpty("这个 Demo 还没有日志。运行课程示例后刷新即可看到调用流程。");
}

function showEmpty(message) {
  elements.emptyState.classList.remove("hidden");
  elements.detailContent.classList.add("hidden");
  const paragraph = elements.emptyState.querySelector("p");
  if (message && paragraph) paragraph.textContent = message;
}

function renderSessions() {
  elements.sessionList.replaceChildren();
  const query = state.search.toLowerCase().trim();
  const sessions = state.sessions.filter((session) => {
    const searchable = `${session.id} ${session.summary?.title || ""} ${session.summary?.summary || ""} ${session.summary?.searchText || ""}`.toLowerCase();
    return searchable.includes(query);
  });
  if (!sessions.length) {
    elements.sessionList.append(createElement("div", {
      className: "list-empty",
      text: state.sessions.length ? "没有匹配的调用记录。" : "暂无日志。运行这个 Demo 后点击右上角刷新。",
    }));
    return;
  }

  sessions.forEach((session, index) => {
    const cached = session.summary || {};
    const button = createElement("button", {
      className: `session-item${session.id === state.session ? " active" : ""}`,
      attrs: { type: "button", "data-session": session.id },
    }, [
      createElement("span", { className: "step-dot", text: sessions.length - index }),
      createElement("span", { className: "session-summary" }, [
        createElement("strong", { text: cached.title || `模型调用 · ${formatTime(session.id)}` }),
        createElement("p", { text: cached.summary || (session.request ? "点击解析本次 Prompt 与模型响应" : "缺少 Request 日志") }),
        createElement("span", { className: "session-meta" }, [
          createElement("i", { className: `status-dot${session.request && session.response ? "" : " incomplete"}` }),
          session.request && session.response ? "REQ + RESP" : "日志不完整",
          ` · ${formatBytes(session.totalBytes)}`,
        ]),
      ]),
      createElement("time", { className: "session-time", text: formatTime(session.id) }),
    ]);
    button.addEventListener("click", () => selectSession(session.id));
    elements.sessionList.append(button);
  });
}

async function selectSession(sessionId) {
  const demoAtStart = state.demo;
  state.session = sessionId;
  renderSessions();
  showEmpty("正在解析这次模型调用…");
  const detail = await getJson(
    `/api/demos/${encodeURIComponent(demoAtStart)}/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (state.demo !== demoAtStart || state.session !== sessionId) return;
  state.detail = detail;
  const summary = summarizeSession(detail);
  const session = state.sessions.find((item) => item.id === sessionId);
  if (session) session.summary = summary;
  renderSessions();
  renderDetail();
}

function metric(label, value, title = "") {
  return createElement("div", { className: "metric-card", attrs: title ? { title } : {} }, [
    createElement("span", { text: label }),
    createElement("strong", { text: value }),
  ]);
}

function renderDetail() {
  const { request, response, session } = state.detail;
  const req = request?.data;
  const resp = response?.data;
  const message = resp?.choices?.[0]?.message;
  const usage = resp?.usage || {};
  const tools = Array.isArray(req?.tools) ? req.tools : [];

  elements.emptyState.classList.add("hidden");
  elements.detailContent.classList.remove("hidden");
  elements.detailDemo.textContent = state.demo;
  elements.detailSession.textContent = session.id;
  elements.detailTitle.textContent = inferCallTitle(req, message);
  elements.metricGrid.replaceChildren(
    metric("模型", req?.model || resp?.model || "—", req?.model || resp?.model || ""),
    metric("消息", Array.isArray(req?.messages) ? req.messages.length : "—"),
    metric("工具定义", tools.length),
    metric("Token", usage.total_tokens ?? "—"),
  );
  renderFlow(req, resp);
  renderJsonTree();
  setView(state.view);
}

function inferCallTitle(request, responseMessage) {
  const system = request?.messages?.find((message) => message.role === "system")?.content || "";
  if (system.includes("分类器")) return "分类决策 · Classify";
  if (system.includes("规划器")) return "修改规划 · Plan";
  if (system.includes("报告生成器")) return "结果汇总 · Report";
  if (responseMessage?.tool_calls?.length) return "工具选择 · Tool Call";
  return "模型推理 · Completion";
}

function flowDetails(icon, iconClass, title, subtitle, body, open = true) {
  const details = createElement("details", { className: "flow-card" });
  details.open = open;
  details.append(
    createElement("summary", {}, [
      createElement("span", { className: `flow-icon ${iconClass}`.trim(), text: icon }),
      createElement("span", { className: "flow-title" }, [
        createElement("strong", { text: title }),
        createElement("span", { text: subtitle }),
      ]),
      createElement("span", { className: "flow-chevron", text: "›" }),
    ]),
    createElement("div", { className: "flow-body" }, Array.isArray(body) ? body : [body]),
  );
  return details;
}

function renderExpandableText(content) {
  const text = content || "(empty)";
  if (text.length <= 1200) {
    return createElement("pre", { className: "message-content", text });
  }

  const details = createElement("details", { className: "long-content" }, [
    createElement("summary", {}, [
      createElement("span", { className: "long-preview", text: `${text.slice(0, 620)}…` }),
      createElement("span", { className: "long-action", text: `展开完整内容 · ${text.length.toLocaleString()} 字符` }),
    ]),
    createElement("pre", { className: "message-content", text }),
  ]);
  details.addEventListener("toggle", () => {
    details.querySelector(".long-action").textContent = details.open
      ? "收起长内容"
      : `展开完整内容 · ${text.length.toLocaleString()} 字符`;
  });
  return details;
}

function renderMessage(message, index) {
  const role = message?.role || "unknown";
  const content = typeof message?.content === "string"
    ? message.content
    : JSON.stringify(message?.content ?? null, null, 2);
  const card = createElement("article", { className: `message-card ${role}` }, [
    createElement("header", { className: "message-head" }, [
      createElement("span", { text: role }),
      createElement("span", { text: `MESSAGE ${index + 1}` }),
    ]),
    renderExpandableText(content),
  ]);
  const embedded = safeParseEmbedded(content);
  if (embedded) {
    const formatted = JSON.stringify(embedded, null, 2);
    card.append(flowDetails(
      "{}", "reason", "识别到内嵌 JSON", `${formatted.length.toLocaleString()} 字符`,
      createElement("pre", { className: "embedded-json", text: formatted }),
      formatted.length < 800,
    ));
  }
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    card.append(renderToolCalls(message.tool_calls));
  }
  return card;
}

function renderToolCalls(toolCalls) {
  const container = createElement("div");
  toolCalls.forEach((call) => {
    const args = safeParseEmbedded(call?.function?.arguments) ?? call?.function?.arguments ?? {};
    container.append(createElement("pre", {
      className: "embedded-json",
      text: `${call?.function?.name || "unknown_tool"}\n${typeof args === "string" ? args : JSON.stringify(args, null, 2)}`,
    }));
  });
  return container;
}

function renderFlow(request, response) {
  elements.flowView.replaceChildren();
  const stack = createElement("div", { className: "flow-stack" });
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  const assistant = response?.choices?.[0]?.message;
  const usage = response?.usage;

  stack.append(flowDetails(
    "01", "",
    "输入上下文",
    `${messages.length} 条消息按顺序进入模型`,
    messages.length ? messages.map(renderMessage) : createElement("p", { className: "flow-note", text: "Request 中没有 messages。" }),
  ));

  if (Array.isArray(request?.tools) && request.tools.length) {
    const toolCards = request.tools.map((tool, index) => renderMessage({
      role: "tool",
      content: JSON.stringify(tool?.function || tool, null, 2),
    }, index));
    stack.append(flowDetails("02", "tool", "可用工具", `${request.tools.length} 个函数定义提供给模型`, toolCards, false));
  }

  if (assistant?.reasoning_content) {
    stack.append(flowDetails(
      "R", "reason", "模型思考",
      `${assistant.reasoning_content.length.toLocaleString()} 字符 · 默认收起，避免淹没主流程`,
      createElement("pre", { className: "message-content", text: assistant.reasoning_content }),
      false,
    ));
  }

  if (assistant) {
    const toolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
    stack.append(flowDetails(
      toolCalls.length ? "TC" : "A",
      toolCalls.length ? "tool" : "assistant",
      toolCalls.length ? "模型选择工具" : "模型输出",
      toolCalls.length ? `${toolCalls.length} 个工具调用，等待运行时执行` : (response?.choices?.[0]?.finish_reason || "assistant response"),
      renderMessage(assistant, 0),
    ));
  } else {
    stack.append(flowDetails(
      "!", "tool", "响应缺失或异常", "没有识别到 choices[0].message",
      createElement("pre", { className: "message-content", text: JSON.stringify(response ?? null, null, 2) }),
    ));
  }

  if (usage) {
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
    const note = [
      `输入 ${usage.prompt_tokens ?? "—"} tokens`,
      `输出 ${usage.completion_tokens ?? "—"} tokens`,
      `总计 ${usage.total_tokens ?? "—"} tokens`,
      reasoningTokens !== undefined ? `其中思考 ${reasoningTokens} tokens` : null,
    ].filter(Boolean).join("  ·  ");
    stack.append(flowDetails("Σ", "reason", "Token 消耗", note, createElement("p", { className: "flow-note", text: note }), false));
  }

  elements.flowView.append(stack);
}

function valueClass(value) {
  if (value === null) return "tree-null";
  if (typeof value === "string") return "tree-string";
  if (typeof value === "number") return "tree-number";
  if (typeof value === "boolean") return "tree-boolean";
  return "tree-meta";
}

function primitiveText(value) {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function countDescendants(value) {
  if (!value || typeof value !== "object") return 0;
  return Object.values(value).reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function buildTreeNode(key, value, depth = 0, pathParts = []) {
  const isObject = value !== null && typeof value === "object";
  const entries = isObject ? Object.entries(value) : [];
  const row = createElement("div", { className: "tree-row", attrs: { "data-depth": depth } });
  const line = createElement("div", { className: "tree-line" });
  const pathText = [...pathParts, key].filter((part) => part !== null).join(".");
  row.dataset.search = `${pathText} ${isObject ? "" : primitiveText(value)}`.toLowerCase();

  const isLongString = typeof value === "string" && value.length > 500;
  if (isObject || isLongString) {
    const toggle = createElement("button", {
      className: "tree-toggle",
      text: isLongString ? "▸" : "▾",
      attrs: { type: "button", "aria-label": "展开或收起" },
    });
    toggle.addEventListener("click", () => {
      row.classList.toggle("collapsed");
      toggle.textContent = row.classList.contains("collapsed") ? "▸" : "▾";
      if (isLongString) {
        const valueElement = line.querySelector(".tree-string");
        valueElement.textContent = row.classList.contains("collapsed")
          ? `${JSON.stringify(value.slice(0, 240))}… (${value.length.toLocaleString()} 字符)`
          : JSON.stringify(value);
      }
    });
    line.append(toggle);
  } else {
    line.append(createElement("span", { className: "tree-spacer" }));
  }

  if (key !== null) {
    line.append(
      createElement("span", { className: "tree-key", text: key }),
      createElement("span", { className: "tree-punctuation", text: ": " }),
    );
  }

  if (isObject) {
    const open = Array.isArray(value) ? "[" : "{";
    const close = Array.isArray(value) ? "]" : "}";
    line.append(
      createElement("span", { className: "tree-punctuation", text: open }),
      createElement("span", { className: "tree-meta", text: ` ${entries.length} ${Array.isArray(value) ? "items" : "keys"} ` }),
      createElement("span", { className: "tree-punctuation", text: close }),
    );
    const children = createElement("div", { className: "tree-children" });
    entries.forEach(([childKey, childValue]) => {
      children.append(buildTreeNode(childKey, childValue, depth + 1, [...pathParts, key].filter(Boolean)));
    });
    row.append(line, children);
    const descendantCount = countDescendants(value);
    if (depth >= 3 || (depth > 0 && descendantCount > 70)) {
      row.classList.add("collapsed");
      line.querySelector(".tree-toggle").textContent = "▸";
    }
  } else {
    const text = isLongString
      ? `${JSON.stringify(value.slice(0, 240))}… (${value.length.toLocaleString()} 字符)`
      : primitiveText(value);
    line.append(createElement("span", { className: valueClass(value), text }));
    row.append(line);
    if (isLongString) row.classList.add("long-value", "collapsed");
  }
  return row;
}

function renderJsonTree() {
  elements.jsonTree.replaceChildren();
  const log = state.detail?.[state.jsonKind];
  if (!log) {
    elements.jsonTree.append(createElement("div", { className: "list-empty", text: `没有 ${state.jsonKind} 日志。` }));
    return;
  }
  if (log.parseError) {
    elements.jsonTree.append(createElement("p", { className: "flow-note", text: `JSON 解析失败：${log.parseError}` }));
  }
  elements.jsonTree.append(buildTreeNode(null, log.data, 0, []));
  applyTreeSearch();
}

function applyTreeSearch() {
  const query = state.treeSearch.toLowerCase().trim();
  const rows = elements.jsonTree.querySelectorAll(".tree-row");
  rows.forEach((row) => row.classList.remove("match"));
  if (!query) return;
  rows.forEach((row) => {
    if (row.dataset.search?.includes(query)) {
      row.classList.add("match");
      let parent = row.parentElement?.closest(".tree-row");
      while (parent) {
        parent.classList.remove("collapsed");
        const toggle = parent.querySelector(":scope > .tree-line > .tree-toggle");
        if (toggle) toggle.textContent = "▾";
        parent = parent.parentElement?.closest(".tree-row");
      }
    }
  });
  elements.jsonTree.querySelector(".tree-row.match")?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function smartExpand() {
  const target = state.view === "flow" ? elements.flowView : elements.jsonTree;
  if (state.view === "flow") {
    target.querySelectorAll("details").forEach((details) => {
      const isReasoning = details.querySelector(".flow-icon.reason") && details.textContent.includes("模型思考");
      details.open = !isReasoning;
    });
  } else {
    renderJsonTree();
  }
}

function collapseAll() {
  const target = state.view === "flow" ? elements.flowView : elements.jsonTree;
  if (state.view === "flow") {
    target.querySelectorAll("details").forEach((details) => { details.open = false; });
  } else {
    target.querySelectorAll(".tree-toggle").forEach((toggle) => {
      if (toggle.textContent === "▾") toggle.click();
    });
  }
}

function setView(view) {
  state.view = view;
  elements.flowView.classList.toggle("hidden", view !== "flow");
  elements.jsonView.classList.toggle("hidden", view !== "json");
  document.querySelectorAll(".view-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
}

function bindEvents() {
  elements.sessionSearch.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderSessions();
  });
  elements.treeSearch.addEventListener("input", (event) => {
    state.treeSearch = event.target.value;
    applyTreeSearch();
  });
  elements.refreshButton.addEventListener("click", async () => {
    elements.refreshButton.classList.add("spinning");
    try {
      await loadDemos({ preserveSelection: true });
      showToast("日志已刷新");
    } catch (error) {
      showToast(error.message);
    } finally {
      elements.refreshButton.classList.remove("spinning");
    }
  });
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
  document.querySelectorAll(".json-kind").forEach((button) => {
    button.addEventListener("click", () => {
      state.jsonKind = button.dataset.kind;
      document.querySelectorAll(".json-kind").forEach((item) => item.classList.toggle("active", item === button));
      renderJsonTree();
    });
  });
  elements.expandSmartButton.addEventListener("click", smartExpand);
  elements.collapseAllButton.addEventListener("click", collapseAll);
}

bindEvents();
loadDemos().catch((error) => {
  showEmpty(`无法读取日志：${error.message}`);
  showToast(error.message);
});
