import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { McpServerConfig, createRuntime, getApiKey } from "../demo6/framework/index.js";

// demo11 复用 demo6 框架的模型调用层，LLM req/resp 日志也统一写在 demo6/llm_logs。
import { LLM_LOG_DIR } from "../demo6/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createMcpSystemMessage() {
  return {
    role: "system",
    content:
      "你是一个支持 MCP 工具调用的 Agent。" +
      "当用户询问天气、城市天气、出行建议时，优先调用天气 MCP 工具获取真实工具结果。" +
      "如果工具返回不支持某个城市，请如实告诉用户当前支持哪些城市。" +
      "不要伪造天气数据。回答使用简洁中文。",
  };
}

async function main() {
  const apiKey = getApiKey();
  const serverPath = path.join(__dirname, "weather_server.js");

  // MCP Server 使用当前 Node.js 可执行文件启动，避免依赖 PATH 中的 node。
  const [runtime, messageStore] = await createRuntime({
    apiKey,
    mcpServers: [
      new McpServerConfig({
        name: "weather",
        command: process.execPath,
        args: [serverPath],
      }),
    ],
    maxLoops: 5,
    maxTurns: 6,
    systemMessage: createMcpSystemMessage(),
  });

  console.log("MCP Agent Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log("你可以试试：帮我查一下杭州今天的天气，并给我一个出行建议。");
  console.log("本节课的天气数据来自 demo11/weather_server.js 里的 MCP Server。");
  console.log(`LLM 请求/响应日志目录：${process.env.LLM_LOG_DIR || LLM_LOG_DIR}`);

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

    messageStore.append({ role: "user", content: userGoal });
    // 记录本轮基线，失败时整轮回滚
    const turnBaseline = messageStore.messages.length;

    try {
      const finalAnswer = await runtime.run(userGoal, messageStore);
      console.log(`\n助手：${finalAnswer}`);
    } catch (error) {
      console.error(`\n执行失败：${error?.message || error}`);
      // 整轮回滚：run 中途失败时可能已写入 assistant(tool_calls)/tool 消息，
      // 只 pop user 会留下“没有 tool 结果的 tool_calls”，
      // 下一轮请求会被 LM Studio 拒掉，所以截断到本轮开始前的状态。
      messageStore.messages.length = turnBaseline;
      if (messageStore.messages.at(-1)?.role === "user") {
        messageStore.messages.pop();
      }
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error(`启动失败：${error?.message || error}`);
  process.exitCode = 1;
});
