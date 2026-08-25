/**
 * LM Studio Agent Hello World（JS 版）
 *
 * 这是一个最小可运行的教程示例，演示：
 * 1. 如何组织 system prompt（系统提示词）
 * 2. 如何组织 user prompt（用户提示词）
 * 3. 如何用 fetch 调用一次 LM Studio 的 OpenAI 兼容 Chat API
 * 4. 如何读取并打印模型返回结果
 *
 * 运行：node demo1/hello_world.js
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

// 端点 / 模型 / 超时 / 鉴权统一来自 shared/config.js（全套 JS demo 共用）。
import {
  API_URL,
  MODEL_NAME,
  REQUEST_TIMEOUT_MS,
  getLlmApiKey,
  MAX_TOKEN
} from "../shared/config.js";
// LLM req/resp 日志约定统一实现在 shared/llm_log.js。
import { createLlmLogSession } from "../shared/llm_log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 本 demo 的 LLM 请求/响应日志目录（命名约定见 shared/llm_log.js）。
const LLM_LOG_DIR = path.join(__dirname, "llm_logs");

// 构造一次最基础的对话消息列表。
function buildMessages() {
  return [
    {
      // 系统提示词，你给你的AI设定的角色和行为准则
      role: "system",
      content:
        "你是一个面向初学者的 Python 和 agent 助手。" +
        "回答时尽量简洁、友好，并在必要时给出清晰步骤。",
    },
    {
      // 用户提示词，用户向AI提出的问题或请求
      role: "user",
      content: "请用一句话介绍什么是 Agent，并给一个生活中的类比。",
    },
  ];
}

/**
 * 调用 LM Studio Chat Completions 接口。
 *
 * 参数：
 * - apiKey: LM Studio 默认无需鉴权，传入 null 即可
 * - messages: 按 chat 格式组织好的消息列表
 *
 * 返回：
 * - 接口返回的完整 JSON 对象
 */
async function callLlm(apiKey, messages) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = {
    // 模型名称
    model: MODEL_NAME,
    // 对话消息，包含 system / user / assistant 等角色
    messages,
    // 非流式输出，方便 hello world 初学者先看完整响应
    stream: false,
    // 将 thinking 关闭（与 Python 版参数一致，LM Studio 会忽略不认识的字段）
    thinking: { type: "disabled" },
    // 输出长度上限（统一取 shared/config.js 的 MAX_TOKEN）。
    // qwen3.5 这类思考模型会先输出大段 reasoning_content 再输出正文，
    // 上限太小（如 Python 原版的 200）会被思考过程全部占掉，导致正文为空。
    max_tokens: MAX_TOKEN,
    // 适度降低随机性，让教程输出更稳定
    temperature: 0.7,
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

  // 如果 HTTP 状态码不是 2xx，这里直接抛出异常，
  // 便于我们快速定位鉴权失败、配额不足、参数错误等问题。
  if (!response.ok) {
    throw new Error(`LLM 请求失败：HTTP ${response.status} ${responseText}`);
  }

  return result;
}

async function main() {
  // LM Studio 本地服务默认无需 API Key（鉴权配置见 shared/config.js）。
  const apiKey = getLlmApiKey();

  const messages = buildMessages();

  console.log("=== 发送给模型的消息 ===");
  console.log(JSON.stringify(messages, null, 2));

  const result = await callLlm(apiKey, messages);

  // OpenAI 兼容格式下，模型的正文通常在：
  // result.choices[0].message.content
  const answer = result?.choices?.[0]?.message?.content;
  console.log("\n=== 模型回复 ===");
  console.log(answer ?? "（模型没有返回内容）");

  // usage 中通常会带上 token 用量，适合教程里顺手观察成本信息。
  const usage = result?.usage;
  if (usage) {
    console.log("\n=== Token 用量 ===");
    console.log(JSON.stringify(usage, null, 2));
  }
}

main().catch((error) => {
  console.error(`执行失败：${error?.message || error}`);
  process.exitCode = 1;
});
