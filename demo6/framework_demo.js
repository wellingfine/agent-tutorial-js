import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import * as builtinTools from "./builtin_tools.js";
import {
  GENERATED_FILES_DIR,
  LLM_LOG_DIR,
  MAX_AGENT_LOOPS,
  MAX_HISTORY_TURNS,
} from "./config.js";
import { createRuntime, getApiKey } from "./framework/index.js";

async function main() {
  // LM Studio 默认无需 API Key，getApiKey() 返回 null 时请求不带鉴权头。
  const apiKey = getApiKey();

  // 这里展示的是第六课推荐的“最小使用方式”：
  // 只给 createRuntime(...) 一个工具模块，它会自动帮我们注册用 tool(...) 包装过的函数。
  const [runtime, messageStore] = await createRuntime({
    apiKey,
    toolModules: [builtinTools],
    maxLoops: MAX_AGENT_LOOPS,
    maxTurns: MAX_HISTORY_TURNS,
  });

  console.log("Framework Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log(
    "你可以试试：帮我生成一份 Python 学习计划，保存成 markdown 文件，然后再读出来帮我检查一下格式。"
  );
  console.log(`模型服务：LM Studio（见 config.js 的 API_URL / MODEL_NAME）`);
  console.log(`工具操作目录：${GENERATED_FILES_DIR}`);
  console.log(`LLM 请求/响应日志目录：${LLM_LOG_DIR}`);
  console.log(`当前会保留最近 ${MAX_HISTORY_TURNS} 轮会话记忆。`);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    let userGoal;
    try {
      userGoal = await rl.question("\n你：");
    } catch {
      // 输入流关闭（EOF）等异常，直接结束会话。
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

    // 会话消息由 MessageStore 托管
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
