/**
 * 第三课：Tool Calling Agent 示例（JS 版）
 *
 * 这个示例演示一个“会使用工具的 Agent”：
 * 1. 使用 system prompt 约束助手身份
 * 2. 使用多轮 messages 维护上下文
 * 3. 使用 tools / tool_calls 机制让模型决定是否调用工具
 * 4. 在本地真正执行一个更有用的工具：创建文件
 * 5. 将工具执行结果再发回模型，让模型生成最终答复
 *
 * 运行：node demo3/tool_demo.js
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

const MAX_TOOL_ROUNDS = 5;

// 所有由工具创建的文件都限制在这个目录里。
// 这样既方便演示，也能避免模型把文件写到任意路径。
const GENERATED_FILES_DIR = path.join(__dirname, "generated_files");

// 本 demo 的 LLM 请求/响应日志目录（命名约定见 shared/llm_log.js）。
const LLM_LOG_DIR = path.join(__dirname, "llm_logs");

// 定义助手的系统提示词。
function createSystemMessage() {
  return {
    role: "system",
    content:
      "你是一个会使用工具的 Python 和 agent 助手。" +
      "当用户明确要求创建文件、生成文档、输出代码文件、保存内容时，" +
      "你应该优先调用工具，而不是只在聊天中口头描述结果。" +
      "如果需要调用工具，请基于用户需求生成合理的文件路径和完整内容。" +
      "工具调用参数必须是完整、合法的 JSON。" +
      "如果内容里有换行、引号或代码块，也必须正确转义，不能输出截断的 JSON。" +
      "如果用户没有要求非常详细的长文档，优先生成简洁但完整的文件内容。" +
      "不要声称文件已经创建，除非工具实际返回成功。" +
      "所有工具创建的文件都必须位于 demo3/generated_files 目录之下。" +
      "在拿到工具结果后，再用简洁清晰的中文告诉用户执行情况。",
  };
}

/**
 * 定义可供模型调用的工具。
 * 演示一个更接近真实工作的工具：创建文件。
 */
function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "create_text_file",
        description:
          "Create a text-based file under demo3/generated_files. " +
          "Use this when the user asks to create a note, markdown file, " +
          "JSON file, Python file, config file, or any other text file.",
        parameters: {
          type: "object",
          properties: {
            relative_path: {
              type: "string",
              description:
                "Relative file path under demo3/generated_files, " +
                "for example notes/todo.md or scripts/hello.py.",
            },
            content: {
              type: "string",
              description:
                "The complete file content to write. " +
                "Keep it complete and valid, but concise unless the user asks for a long document.",
            },
            overwrite: {
              type: "boolean",
              description: "Whether to overwrite the file if it already exists.",
            },
          },
          required: ["relative_path", "content", "overwrite"],
        },
      },
    },
  ];
}

/**
 * 将模型给出的相对路径解析成安全的绝对路径。
 *
 * 这里做两层保护：
 * 1. 不允许绝对路径
 * 2. 不允许跳出 GENERATED_FILES_DIR
 */
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
    throw new Error("不允许写入 demo3/generated_files 目录之外的路径。");
  }

  return target;
}

// 真正执行“创建文件”工具。
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

/**
 * 调用 LM Studio Chat API，返回 assistant message。
 *
 * 当模型决定调用工具时，返回结果里会包含 tool_calls。
 * 当模型不需要调用工具时，返回结果里通常会直接包含 content。
 */
async function callLlm(apiKey, messages, tools) {
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

  return result?.choices?.[0]?.message;
}

/**
 * 根据模型给出的 tool_call，在本地执行对应工具。
 *
 * OpenAI 兼容格式里，函数参数通常以 JSON 字符串形式
 * 放在 tool_call.function.arguments 中。
 */
async function executeToolCall(toolCall) {
  const functionInfo = toolCall.function || {};
  const functionName = functionInfo.name;
  const rawArguments = functionInfo.arguments ?? "{}";

  let arguments_ = {};
  try {
    arguments_ = JSON.parse(rawArguments || "{}");
  } catch (error) {
    return {
      ok: false,
      error:
        `工具参数不是合法 JSON：${error.message}。` +
        "请重新发起同一个工具调用，并返回完整、未截断的合法 JSON 参数。",
      tool_name: functionName,
      raw_arguments: rawArguments,
    };
  }

  if (functionName === "create_text_file") {
    const missing = ["relative_path", "content", "overwrite"].filter(
      (key) => arguments_[key] === undefined
    );
    if (missing.length > 0) {
      return {
        ok: false,
        error: `缺少必要参数：${missing.join(", ")}`,
        tool_name: functionName,
        arguments: arguments_,
      };
    }

    return createTextFile({
      relative_path: arguments_.relative_path,
      content: arguments_.content,
      overwrite: arguments_.overwrite,
    });
  }

  return {
    ok: false,
    error: `未知工具：${functionName}`,
    tool_name: functionName,
    arguments: arguments_,
  };
}

/**
 * 执行一轮完整的 Agent 交互。
 *
 * 一轮里可能发生两种情况：
 * 1. 模型直接返回自然语言答案
 * 2. 模型先请求调用工具，我们执行工具后，再把结果发回模型拿最终答案
 *
 * 为了避免异常情况下无限循环，这里限制最多进行 MAX_TOOL_ROUNDS 轮工具交互。
 */
async function runAgentTurn(apiKey, messages) {
  const tools = buildTools();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const assistantMessage = await callLlm(apiKey, messages, tools);
    const toolCalls = assistantMessage?.tool_calls || [];

    if (toolCalls.length > 0) {
      // 先把“模型想调用什么工具”记录到对话历史里，
      // 这样下一次请求时，模型能看到自己上一步做了什么决策。
      messages.push({
        role: "assistant",
        content: assistantMessage?.content ?? null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name || "unknown_tool";
        const rawArguments = toolCall.function?.arguments ?? "{}";

        console.log(`\n[工具调用] ${toolName}`);
        console.log(`[工具参数] ${rawArguments}`);

        const toolResult = await executeToolCall(toolCall);
        console.log(`[工具结果] ${JSON.stringify(toolResult)}`);

        // 以 role=tool 的消息把工具执行结果返回给模型。
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // 有工具调用时，不立即返回，而是继续下一轮，
      // 让模型基于工具结果输出最终自然语言答复。
      continue;
    }

    const finalAnswer =
      assistantMessage?.content || "我已经完成处理，但没有生成额外文本。";
    messages.push({ role: "assistant", content: finalAnswer });
    return finalAnswer;
  }

  throw new Error(
    "工具调用轮数过多，已停止，避免无限循环。" +
      "这通常说明模型连续返回了损坏或截断的工具参数。" +
      "可以重试一次，或者让它生成更短一点的文件内容。"
  );
}

async function main() {
  // LM Studio 本地服务默认无需 API Key（鉴权配置见 shared/config.js）。
  const apiKey = getLlmApiKey();

  const messages = [createSystemMessage()];

  console.log("Tool Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log("你可以试试：帮我创建一个 markdown 文件，内容是一个 Agent 教程大纲。");
  console.log(`工具创建的文件会保存在：${GENERATED_FILES_DIR}`);
  console.log(`LLM 请求/响应日志目录：${LLM_LOG_DIR}`);

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

    messages.push({ role: "user", content: userInput });
    // 记录本轮基线，失败时整轮回滚
    const turnBaseline = messages.length;

    try {
      const answer = await runAgentTurn(apiKey, messages);
      console.log(`\n助手：${answer}`);
    } catch (error) {
      console.error(`\n执行失败：${error?.message || error}`);
      // 整轮回滚：一轮里可能已写入 assistant(tool_calls)/tool 消息，
      // 只 pop user 会留下“没有 tool 结果的 tool_calls”，
      // 下一轮请求会被 LM Studio 拒掉，所以截断到本轮开始前的状态。
      messages.length = turnBaseline;
      if (messages.at(-1)?.role === "user") {
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
