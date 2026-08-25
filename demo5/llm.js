import {
  API_URL,
  LLM_LOG_DIR,
  MAX_TOKEN,
  MODEL_NAME,
  REQUEST_TIMEOUT_MS,
} from "./config.js";
import { createLlmLogSession } from "../shared/llm_log.js";

// LM Studio 本地服务默认不校验鉴权，无需 API Key（鉴权配置见 shared/config.js）。
export { getLlmApiKey as getApiKey } from "../shared/config.js";

// 定义第五课 ReAct Agent 的系统提示词。
export function createSystemMessage() {
  return {
    role: "system",
    content:
      "你是一个更真实的 ReAct 风格 Agent。" +
      "你需要结合会话记忆、当前用户目标、工具结果，决定下一步是否调用工具。" +
      "如果任务还没完成，请继续调用合适工具。" +
      "如果任务已经完成，请直接给出最终自然语言答复。" +
      "不要假装工具已经执行成功，除非你已经看到了真实的 tool 结果。" +
      "你拥有多个工具，需要根据任务自动选择最合适的工具。" +
      "如果用户要求保存文件，优先使用 create_text_file。" +
      "如果用户要求检查、核对、读取文件内容，优先使用 read_text_file。" +
      "如果用户问当前有哪些文件，优先使用 list_files。" +
      "所有文件都只能位于 demo5/generated_files 中。" +
      "回答使用简洁清晰的中文。",
  };
}

// 调用 LM Studio Chat API，返回 assistant message。
export async function callLlm(apiKey, messages, tools) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = {
    model: MODEL_NAME,
    messages,
    tools,
    tool_choice: "auto",
    stream: false,
    thinking: { type: "disabled" },
    max_tokens: MAX_TOKEN,
    temperature: 0.2,
  };

  const logSession = createLlmLogSession({ logDir: LLM_LOG_DIR });
  const reqLogPath = await logSession.write("req", payload);
  console.log(`[LLM 日志] 请求参数 -> ${reqLogPath}`);

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const responseText = await response.text();

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { parse_error: "响应不是合法 JSON", raw_body: responseText };
  }

  const respLogData = response.ok
    ? result
    : { http_status: response.status, ...result };
  const respLogPath = await logSession.write("resp", respLogData);
  console.log(`[LLM 日志] 响应结果 -> ${respLogPath}`);

  if (!response.ok) {
    throw new Error(`LLM 请求失败：HTTP ${response.status} ${responseText}`);
  }

  const assistantMessage = result?.choices?.[0]?.message;
  if (!assistantMessage) {
    throw new Error(`LLM 返回数据里找不到 choices[0].message。原始响应：${responseText}`);
  }

  return assistantMessage;
}
