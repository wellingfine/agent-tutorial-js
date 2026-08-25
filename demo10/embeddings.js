import { LLM_LOG_DIR } from "../demo6/config.js";
import { REQUEST_TIMEOUT_MS } from "../shared/config.js";
import { createLlmLogSession } from "../shared/llm_log.js";

import { EMBEDDING_API_URL, EMBEDDING_MODEL } from "./config.js";

/**
 * 使用 LM Studio 的 embedding 模型把文本转成向量。
 *
 * RAG 里最关键的一步就是把人类可读的文本转换成机器可检索的向量。
 * embedding 调用与 chat 调用共用同一套日志约定：
 * llm_logs/YYYYMMDD-hhmmss-req.json / YYYYMMDD-hhmmss-resp.json
 */
export async function embedTexts(texts) {
  if (!texts || texts.length === 0) {
    return [];
  }

  const payload = { model: EMBEDDING_MODEL, input: texts };

  // 与 demo6 框架的 chat 日志共用 demo6/llm_logs，方便一次会话的日志配对。
  const logSession = createLlmLogSession({ logDir: LLM_LOG_DIR });
  const reqLogPath = await logSession.write("req", payload);
  console.log(`[Embedding 日志] 请求参数 -> ${reqLogPath}`);

  let response;
  try {
    response = await fetch(EMBEDDING_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    await logSession.write("resp", {
      ok: false,
      error: `请求发送失败：${error?.message || error}`,
    });
    throw new Error(`Embedding 请求发送失败：${error?.message || error}`);
  }

  const responseText = await response.text();

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = { parse_error: "响应不是合法 JSON", raw_body: responseText };
  }

  const respLogData = response.ok
    ? parsed
    : { http_status: response.status, ...parsed };
  const respLogPath = await logSession.write("resp", respLogData);
  console.log(`[Embedding 日志] 响应结果 -> ${respLogPath}`);

  if (!response.ok) {
    throw new Error(`Embedding 请求失败：HTTP ${response.status} ${responseText}`);
  }

  // 返回的 data 顺序和 input 顺序一致，因此可以直接按 index 排序取出。
  const items = [...(parsed?.data || [])].sort((a, b) => a.index - b.index);
  return items.map((item) => item.embedding);
}

// 查询文本也要使用同一个 embedding 模型，否则向量空间不一致。
export async function embedQuery(query) {
  const embeddings = await embedTexts([query]);
  return embeddings[0];
}
