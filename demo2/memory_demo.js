/**
 * 多轮对话 + Memory 示例（JS 版）
 *
 * 这个示例演示一个最基础的“带记忆的 Agent”：
 * 1. 使用 system prompt 约束助手身份
 * 2. 通过 user / assistant 消息维护多轮对话历史
 * 3. 用 fetch 调用 LM Studio 的 OpenAI 兼容 Chat API
 * 4. 通过“保留最近若干轮对话”的方式模拟短期记忆
 *
 * 运行：node demo2/memory_demo.js
 */

import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

// 端点 / 模型 / 超时 / 鉴权统一来自 shared/config.js（全套 JS demo 共用）。
import {
  API_URL,
  MODEL_NAME,
  MAX_TOKEN,
  REQUEST_TIMEOUT_MS,
  getLlmApiKey,
} from "../shared/config.js";
// LLM req/resp 日志约定统一实现在 shared/llm_log.js。
import { createLlmLogSession } from "../shared/llm_log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 保留最近多少轮用户/助手对话。
// 一轮对话通常由两条消息组成：
// - 一条 user
// - 一条 assistant
// 这里保留最近 4 轮，足够演示“短期记忆”的概念。
const MAX_TURNS = 4;

// 本 demo 的 LLM 请求/响应日志目录（命名约定见 shared/llm_log.js）。
const LLM_LOG_DIR = path.join(__dirname, "llm_logs");

// 创建 system prompt。
function createSystemMessage() {
  return {
    role: "system",
    content:
      "你是一个面向初学者的 Python 和 agent 助手。" +
      "请使用简洁、友好、清晰的中文回答。" +
      "如果用户的问题依赖上文，请结合对话历史继续回答。",
  };
}

/**
 * 裁剪对话历史，只保留 system prompt 和最近若干轮对话。
 *
 * 为什么要裁剪：
 * - 多轮对话越长，发送给模型的 token 就越多
 * - token 越多，请求成本和响应时间通常也会增加
 *
 * 这里采用最容易理解的策略：
 * - 永远保留第 1 条 system 消息
 * - 其余消息里，只保留最近 max_turns 轮
 */
function trimMessages(messages, maxTurns) {
  if (messages.length === 0) {
    return messages;
  }

  const systemMessage = messages[0];
  let recentMessages = messages.slice(1);
  const maxMessageCount = maxTurns * 2;

  if (recentMessages.length > maxMessageCount) {
    recentMessages = recentMessages.slice(-maxMessageCount);
  }

  return [systemMessage, ...recentMessages];
}

/**
 * 调用 LM Studio Chat API，并返回模型回复文本。
 *
 * 这里把 messages 整体发送给模型，
 * 这样模型才能“看到”前面的对话历史。
 */
async function callLlm(apiKey, messages) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = {
    model: MODEL_NAME,
    messages,
    stream: false,
    thinking: { type: "disabled" },
    max_tokens: MAX_TOKEN,
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

  if (!response.ok) {
    throw new Error(`LLM 请求失败：HTTP ${response.status} ${responseText}`);
  }

  return result?.choices?.[0]?.message?.content ?? "";
}

async function main() {
  // LM Studio 本地服务默认无需 API Key（鉴权配置见 shared/config.js）。
  const apiKey = getLlmApiKey();

  // messages 就是这个示例里的“短期记忆”。
  // 每次用户发言和助手回复，都会被追加到这里。
  let messages = [createSystemMessage()];

  console.log("Memory Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log(`当前会保留最近 ${MAX_TURNS} 轮对话作为短期记忆。`);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    let userInput;
    try {
      userInput = await rl.question("\n你：");
    } catch {
      break;
    }

    if (userInput === null || userInput === undefined) {
      break;
    }

    userInput = userInput.trim();

    if (!userInput) {
      console.log("请输入内容。");
      continue;
    }

    if (["exit", "quit"].includes(userInput.toLowerCase())) {
      console.log("对话结束。");
      break;
    }

    // 先把用户输入加入记忆中。
    messages.push({ role: "user", content: userInput });

    // 为了避免历史越来越长，发送前先裁剪一次。
    messages = trimMessages(messages, MAX_TURNS);

    let answer;
    try {
      answer = await callLlm(apiKey, messages);
    } catch (error) {
      console.error(`\n请求失败：${error?.message || error}`);
      // 这次请求失败时，把刚刚加入的 user 消息回滚掉，
      // 避免一次失败请求污染后续对话历史。
      if (messages.length > 1 && messages[messages.length - 1].role === "user") {
        messages.pop();
      }
      continue;
    }

    console.log(`\n助手：${answer}`);

    // 模型回复也必须写回记忆。
    // 否则下一轮用户如果说“展开讲讲”或“换个例子”，
    // 模型可能无法准确理解它是在接着哪一句往下说。
    messages.push({ role: "assistant", content: answer });

    // 回写 assistant 后再裁剪一次，保证记忆长度稳定。
    messages = trimMessages(messages, MAX_TURNS);
  }

  rl.close();
}

main().catch((error) => {
  console.error(`启动失败：${error?.message || error}`);
  process.exitCode = 1;
});
