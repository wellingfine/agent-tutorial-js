import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { MessageStore, ToolRegistry, getApiKey } from "../demo6/framework/index.js";

// demo7 复用 demo6 框架的模型调用层，LLM req/resp 日志也统一写在 demo6/llm_logs。
import { LLM_LOG_DIR } from "../demo6/config.js";
import { MAX_HISTORY_TURNS, WORKSPACE_DIR } from "./config.js";
import { CodingAgentRuntime } from "./coding_runtime.js";
import { registerCodingTools } from "./coding_tools.js";

async function main() {
  const apiKey = getApiKey();
  const registry = new ToolRegistry();
  registerCodingTools(registry);

  // 这里直接复用 demo6 框架里的 ToolRegistry 和 MessageStore。
  const runtime = new CodingAgentRuntime({ apiKey, toolRegistry: registry });
  const messageStore = new MessageStore({ maxTurns: MAX_HISTORY_TURNS });

  console.log("Coding Agent Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log("你可以试试：帮我找到 greet_user 的实现，并给空名字加一个更友好的处理。");
  console.log(`工作区目录：${WORKSPACE_DIR}`);
  console.log(`LLM 请求/响应日志目录：${process.env.LLM_LOG_DIR || LLM_LOG_DIR}`);
  console.log(`当前会保留最近 ${MAX_HISTORY_TURNS} 轮会话记忆。`);

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

    // coding agent 同样使用 message history。
    // 这意味着多轮任务约束、上文要求、前一次修改结论都能被保留下来。
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
