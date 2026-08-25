import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { runReactAgent, trimMessages } from "./agent.js";
import { GENERATED_FILES_DIR, MAX_HISTORY_TURNS } from "./config.js";
import { getApiKey } from "./llm.js";

async function main() {
  // LM Studio 本地服务默认无需 API Key。
  const apiKey = getApiKey();

  console.log("ReAct Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log(
    "你可以试试：帮我生成一份 Python 学习计划，保存成 markdown 文件，然后再读出来帮我检查一下格式。"
  );
  console.log(`工具操作目录：${GENERATED_FILES_DIR}`);
  console.log(`当前会保留最近 ${MAX_HISTORY_TURNS} 轮会话记忆。`);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  let messages = [];

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
    // 记录本轮基线，失败时整轮回滚
    const turnBaseline = messages.length;

    try {
      const finalAnswer = await runReactAgent(apiKey, userGoal, messages);
      messages = trimMessages(messages, MAX_HISTORY_TURNS);
      console.log(`\n助手：${finalAnswer}`);
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
