/**
 * 第四课：Planning Demo（JS 版）
 *
 * 这一节把“先做什么、后做什么”显式化，让模型不再直接冲着结果输出，
 * 而是先决定下一步动作：
 * 1. 模型只返回 JSON 决策（action + 相关字段）
 * 2. 程序侧维护 state，在 decide_path -> draft_content -> create_file -> finish 之间推进
 *
 * 运行：node demo4/planning_demo.js
 */

import fsp from "node:fs/promises";
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
// LLM req/resp 日志约定、安全路径工具统一在 shared/ 下。
import { createLlmLogSession } from "../shared/llm_log.js";
import { resolveLikePython } from "../shared/safe_path.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_AGENT_STEPS = 6;
const MAX_HISTORY_TURNS = 6;
const GENERATED_FILES_DIR = path.join(__dirname, "generated_files");

// 本 demo 的 LLM 请求/响应日志目录（命名约定见 shared/llm_log.js）。
const LLM_LOG_DIR = path.join(__dirname, "llm_logs");

// 定义系统提示词，让模型按固定动作集合分步推进。
function createSystemMessage() {
  return {
    role: "system",
    content:
      "你是一个分步执行任务的 Agent。" +
      "你不能一次性跳过所有步骤，而是要根据当前状态决定下一步动作。" +
      "你必须结合已有的会话历史理解用户偏好、默认约定和上文提到的内容。" +
      "你只允许返回 JSON，不要输出 markdown，不要输出额外解释。" +
      "可选动作只有四种：decide_path、draft_content、create_file、finish。" +
      "动作规则如下：" +
      "1. 如果还没有文件路径，优先 decide_path。" +
      "2. 如果还没有文件内容，优先 draft_content。" +
      "3. 如果路径和内容都准备好了，但文件还没创建，使用 create_file。" +
      "4. 只有在任务已经完成，或者不需要再执行动作时，才能 finish。" +
      "返回 JSON 时请使用以下字段：" +
      "step_summary、action、relative_path、content、final_response。" +
      "其中 step_summary 是简短的人类可读步骤说明，不要暴露冗长推理。" +
      "relative_path 和 content 可以为 null，但在需要时必须提供完整值。" +
      "如果用户没有要求超长文档，请生成简洁但完整的内容。" +
      "所有待创建文件都必须位于 demo4/generated_files 目录之下。",
  };
}

// 只保留最近若干轮 user / assistant 历史消息。
function trimMessages(messages, maxTurns) {
  const maxMessageCount = maxTurns * 2;
  if (messages.length > maxMessageCount) {
    return messages.slice(-maxMessageCount);
  }
  return messages;
}

// 将相对路径解析为安全的绝对路径，禁止跳出 demo4/generated_files。
async function resolveSafePath(relativePath) {
  const cleanedPath = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!cleanedPath) {
    throw new Error("relative_path 不能为空。");
  }

  if (path.isAbsolute(cleanedPath)) {
    throw new Error("relative_path 不能是绝对路径。");
  }

  const baseDir = await resolveLikePython(GENERATED_FILES_DIR);
  const target = await resolveLikePython(path.join(GENERATED_FILES_DIR, cleanedPath));
  const relative = path.relative(baseDir, target);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("不允许写入 demo4/generated_files 目录之外的路径。");
  }

  return target;
}

// 在安全目录中创建文本文件。
async function createTextFile({ relative_path, content, overwrite }) {
  let targetPath;
  try {
    targetPath = await resolveSafePath(relative_path);
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      relative_path,
    };
  }

  await fsp.mkdir(path.dirname(targetPath), { recursive: true });

  let existedBefore = false;
  try {
    await fsp.access(targetPath);
    existedBefore = true;
  } catch {
    // 文件不存在
  }

  if (existedBefore && !overwrite) {
    return {
      ok: false,
      error: "文件已存在，且 overwrite 为 False。",
      path: targetPath,
    };
  }

  const contentString = String(content ?? "");
  await fsp.writeFile(targetPath, contentString, "utf-8");

  return {
    ok: true,
    path: targetPath,
    created: !existedBefore,
    overwritten: existedBefore,
    characters_written: contentString.length,
  };
}

// 将当前任务状态整理成一条消息，发给模型决定下一步动作。
function buildStateMessage(userGoal, state, stepLogs) {
  const stepLogText =
    stepLogs.length > 0 ? stepLogs.map((item) => `- ${item}`).join("\n") : "- 暂无";
  const toolResult = state.tool_result;
  const toolResultText =
    toolResult !== null && toolResult !== undefined
      ? JSON.stringify(toolResult, null, 2)
      : "null";

  const content = `
用户目标：
${userGoal}

当前状态：
- relative_path: ${state.relative_path}
- has_content: ${state.content ? "yes" : "no"}
- file_created: ${state.file_created}
- overwrite: ${state.overwrite}
- tool_result:
${toolResultText}

之前已经执行的步骤：
${stepLogText}

请只返回一个 JSON 对象，字段如下：
{
  "step_summary": "简短说明下一步要做什么",
  "action": "decide_path | draft_content | create_file | finish",
  "relative_path": "字符串或 null",
  "content": "字符串或 null",
  "final_response": "字符串或 null"
}
`.trim();

  return { role: "user", content };
}

// 调用模型，让它根据当前状态决定下一步动作。
async function callPlanner(apiKey, userGoal, messages, state, stepLogs) {
  const requestMessages = [
    createSystemMessage(),
    ...trimMessages(messages, MAX_HISTORY_TURNS),
    buildStateMessage(userGoal, state, stepLogs),
  ];

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = {
    model: MODEL_NAME,
    messages: requestMessages,
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

  const rawContent = result?.choices?.[0]?.message?.content;
  return parseJsonResponse(String(rawContent ?? ""));
}

// 把模型返回的 JSON 文本解析成对象。
function parseJsonResponse(rawContent) {
  let text = rawContent.trim();

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
    throw new Error(`模型没有返回合法 JSON：${error.message}\n原始内容：${rawContent}`);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`模型返回的 JSON 不是对象：${rawContent}`);
  }

  return data;
}

/**
 * 把模型返回里的可选字段写回状态。
 *
 * 例如模型在 draft_content 阶段，可能顺便也给出一个更合适的 relative_path。
 */
function applyModelUpdates(state, decision) {
  const relativePath = decision.relative_path;
  if (typeof relativePath === "string" && relativePath.trim()) {
    state.relative_path = relativePath.trim();
  }

  const content = decision.content;
  if (typeof content === "string" && content.trim()) {
    state.content = content;
  }
}

// 执行一轮完整的多步任务。
async function runTaskAgent(apiKey, userGoal, messages) {
  const state = {
    relative_path: null,
    content: null,
    file_created: false,
    overwrite: true,
    tool_result: null,
  };
  const stepLogs = [];

  for (let stepNumber = 1; stepNumber <= MAX_AGENT_STEPS; stepNumber += 1) {
    const decision = await callPlanner(apiKey, userGoal, messages, state, stepLogs);

    const action = decision.action;
    const stepSummary = decision.step_summary || "模型没有提供步骤说明。";

    console.log(`\n[步骤 ${stepNumber}] ${action}`);
    console.log(`[步骤说明] ${stepSummary}`);

    applyModelUpdates(state, decision);

    if (action === "decide_path") {
      if (!state.relative_path) {
        throw new Error("模型选择了 decide_path，但没有提供 relative_path。");
      }
      stepLogs.push(`已确定文件路径：${state.relative_path}`);
      continue;
    }

    if (action === "draft_content") {
      if (!state.content) {
        throw new Error("模型选择了 draft_content，但没有提供 content。");
      }
      stepLogs.push(`已生成文件内容草稿，长度约 ${state.content.length} 个字符。`);
      continue;
    }

    if (action === "create_file") {
      if (!state.relative_path) {
        throw new Error("模型选择了 create_file，但还没有 relative_path。");
      }
      if (!state.content) {
        throw new Error("模型选择了 create_file，但还没有 content。");
      }

      const toolResult = await createTextFile({
        relative_path: state.relative_path,
        content: state.content,
        overwrite: state.overwrite,
      });
      state.tool_result = toolResult;
      state.file_created = Boolean(toolResult.ok);

      console.log(`[工具结果] ${JSON.stringify(toolResult)}`);

      if (toolResult.ok) {
        stepLogs.push(`已创建文件：${toolResult.path}`);
      } else {
        stepLogs.push(`创建文件失败：${toolResult.error}`);
      }
      continue;
    }

    if (action === "finish") {
      let finalResponse = decision.final_response;
      if (typeof finalResponse !== "string" || !finalResponse.trim()) {
        if (state.file_created && state.tool_result) {
          finalResponse = `任务已完成，文件已创建：${state.tool_result.path}`;
        } else {
          finalResponse = "任务已结束。";
        }
      }
      return finalResponse;
    }

    throw new Error(`模型返回了未知动作：${action}`);
  }

  throw new Error("超过最大步骤数，任务仍未完成。可以让任务描述更具体一些再重试。");
}

async function main() {
  // LM Studio 本地服务默认无需 API Key（鉴权配置见 shared/config.js）。
  const apiKey = getLlmApiKey();

  console.log("Planning Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log("你可以试试：帮我生成一份 Python 学习计划，并保存成 markdown 文件。");
  console.log(`生成的文件会保存在：${GENERATED_FILES_DIR}`);
  console.log(`LLM 请求/响应日志目录：${LLM_LOG_DIR}`);
  console.log(`当前会保留最近 ${MAX_HISTORY_TURNS} 轮会话记忆。`);

  // messages 继承第二课的思路：
  // - user / assistant 消息会被持续保存
  // - 后续任务会带着这些上下文一起交给模型
  let messages = [];

  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    let userGoal;
    try {
      userGoal = await rl.question("\n你：");
    } catch {
      break;
    }

    if (userGoal === null || userGoal === undefined) {
      break;
    }

    userGoal = userGoal.trim();

    if (!userGoal) {
      console.log("请输入任务目标。");
      continue;
    }

    if (["exit", "quit"].includes(userGoal.toLowerCase())) {
      console.log("对话结束。");
      break;
    }

    messages.push({ role: "user", content: userGoal });
    messages = trimMessages(messages, MAX_HISTORY_TURNS);

    try {
      const finalAnswer = await runTaskAgent(apiKey, userGoal, messages);
      messages.push({ role: "assistant", content: finalAnswer });
      messages = trimMessages(messages, MAX_HISTORY_TURNS);
      console.log(`\n助手：${finalAnswer}`);
    } catch (error) {
      console.error(`\n执行失败：${error?.message || error}`);
      if (messages.length > 0 && messages[messages.length - 1].role === "user") {
        messages.pop();
      }
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error(`启动失败：${error?.message || error}`);
  process.exitCode = 1;
});
