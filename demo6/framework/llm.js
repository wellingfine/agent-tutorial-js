import {
  API_URL,
  LLM_LOG_DIR,
  MAX_TOKEN,
  MODEL_NAME,
  REQUEST_TIMEOUT_MS,
} from "../config.js";
import { getLlmApiKey as getApiKey } from "../../shared/config.js";
import { createLlmLogSession } from "../../shared/llm_log.js";

// LM Studio 本地服务默认不校验鉴权，无需 API Key。
// 如果你的 LM Studio 开启了 API Key 校验，可通过环境变量 LMSTUDIO_API_KEY 提供。
export { getApiKey };

export function createSystemMessage() {
  // 定义小型 Agent 框架默认使用的系统提示词。
  //
  // 这里故意保持得比较通用：
  // - 不绑定某个具体业务
  // - 只强调 runtime、工具调用、结果真实性
  // 这样后续的 coding agent / workflow 才能在上面继续定制。
  return {
    role: "system",
    content:
      "你是一个基于小型 Agent Runtime 运行的 ReAct 风格 Agent。" +
      "你需要结合用户目标、会话消息、工具结果和运行时状态，自主决定下一步。" +
      "如果任务需要外部动作，请调用合适工具。" +
      "如果任务已经完成，请直接输出最终自然语言答复。" +
      "不要声称工具已执行成功，除非你已经看到了真实的 tool 结果。" +
      "回答使用简洁清晰的中文。",
  };
}

/**
 * 调用 LM Studio 的 OpenAI 兼容 Chat API，返回 assistant message。
 *
 * 这一层只做“模型通信”，不做业务判断。
 * 这样 runtime、tool registry、tool handlers 都能保持边界清楚。
 *
 * 同时会把每次调用的输入参数与返回结果落盘到调用方指定的 logDir：
 *   YYYYMMDD-hhmmss-req.json  /  YYYYMMDD-hhmmss-resp.json
 * 未指定时默认使用 demo6/llm_logs。
 */
export async function callLlm({
  apiKey = getApiKey(),
  messages,
  tools,
  apiUrl = API_URL,
  modelName = MODEL_NAME,
  maxCompletionTokens = MAX_TOKEN,
  logDir = LLM_LOG_DIR,
} = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = {
    model: modelName,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
    // 与 Python 版参数保持一致，直接移植；
    // LM Studio 会忽略不认识的字段，不影响运行。
    thinking: { type: "disabled" },
    max_tokens: maxCompletionTokens,
    temperature: 0.2,
  };

  // 输入参数打 log：llm_logs/YYYYMMDD-hhmmss-req.json
  // （日志命名与落盘约定统一实现在 shared/llm_log.js）
  const logSession = createLlmLogSession({ logDir });
  const reqLogPath = await logSession.write("req", payload);
  console.log(`[LLM 日志] 请求参数 -> ${reqLogPath}`);

  let response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // 请求没发出去也补一份 resp 日志，保证 req/resp 成对完整。
    await logSession.write("resp", {
      ok: false,
      error: `请求发送失败：${error?.message || error}`,
    });
    throw new Error(`LLM 请求发送失败：${error?.message || error}`);
  }

  const responseText = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = { parse_error: "响应不是合法 JSON", raw_body: responseText };
  }

  // 返回结果打 log：llm_logs/YYYYMMDD-hhmmss-resp.json（与 req 同名配对）
  const respLogData = response.ok
    ? parsed
    : {
        http_status: response.status,
        ...(parsed && typeof parsed === "object" ? parsed : { body: parsed }),
      };
  const respLogPath = await logSession.write("resp", respLogData);
  console.log(`[LLM 日志] 响应结果 -> ${respLogPath}`);

  if (!response.ok) {
    throw new Error(`LLM 请求失败：HTTP ${response.status} ${responseText}`);
  }

  const assistantMessage = parsed?.choices?.[0]?.message;
  if (!assistantMessage) {
    throw new Error(`LLM 返回数据里找不到 choices[0].message。原始响应：${responseText}`);
  }

  return assistantMessage;
}

// 构造最简单的单轮提示消息。
export function buildMessages(systemPrompt, userContent) {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
}

// 请求模型返回普通文本。
// 适合 workflow 节点内部的“一次性调用”场景。
export async function askLlmText(
  systemPrompt,
  userContent,
  { apiKey = null, logDir = LLM_LOG_DIR } = {}
) {
  const message = await callLlm({
    apiKey: apiKey ?? getApiKey(),
    messages: buildMessages(systemPrompt, userContent),
    tools: [],
    logDir: logDir || LLM_LOG_DIR,
  });
  return message.content || "";
}

// 请求模型返回 JSON 文本并解析。
// 这层封装的意义是：
// - workflow 节点只关心“我要一个 JSON 结果”
// - 不需要每个节点都重复写 parse 逻辑
export async function askLlmJson(
  systemPrompt,
  userContent,
  { apiKey = null, logDir = LLM_LOG_DIR } = {}
) {
  let text = (await askLlmText(systemPrompt, userContent, { apiKey, logDir })).trim();

  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines.length >= 3) {
      text = lines.slice(1, -1).join("\n").trim();
    }
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`模型没有返回合法 JSON：${error.message}\n原始内容：${text}`);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`模型返回的 JSON 不是对象：${text}`);
  }

  return data;
}
