import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { getApiKey } from "../demo6/framework/index.js";

// demo8 复用 demo6 框架的模型调用层，LLM req/resp 日志也统一写在 demo6/llm_logs。
import { LLM_LOG_DIR } from "../demo6/config.js";
import { MAX_WORKFLOW_STEPS, WORKSPACE_DIR } from "./config.js";
import { CodeWorkflowContext } from "./example_context.js";
import { Workflow } from "./framework/index.js";
import {
  ApplyNode,
  ClassifyNode,
  InspectNode,
  PlanNode,
  ReportNode,
  VerifyNode,
} from "./nodes.js";

function buildWorkflow() {
  /**
   * 构造一条固定的 workflow。
   *
   * 这就是第八课要展示的核心：
   * - framework 层只负责 workflow 能力
   * - example 层负责把节点和业务任务拼起来
   */
  const classify = new ClassifyNode({ name: "classify" });
  const inspect = new InspectNode({ name: "inspect" });
  const plan = new PlanNode({ name: "plan" });
  const applyNode = new ApplyNode({ name: "apply" });
  const verify = new VerifyNode({ name: "verify" });
  const report = new ReportNode({ name: "report" });

  classify.connect("inspect", inspect);
  inspect.connect("plan", plan);
  inspect.connect("report", report);
  plan.connect("apply", applyNode);
  applyNode.connect("verify", verify);
  verify.connect("report", report);

  return new Workflow({ startNode: classify, maxSteps: MAX_WORKFLOW_STEPS });
}

async function main() {
  // 这里只做一次环境检查，确保后面的节点调用 LLM 时不会因为缺 key 才报错。
  getApiKey();

  console.log("Workflow Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log("你可以试试：帮我找到 utils.py 里的 greet_user，并把空名字处理改得更友好。");
  console.log(`工作区目录：${WORKSPACE_DIR}`);
  console.log(`LLM 请求/响应日志目录：${LLM_LOG_DIR}`);

  const workflow = buildWorkflow();
  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    let goal;
    try {
      goal = await rl.question("\n你：");
    } catch {
      break;
    }

    if (goal === null || goal === undefined) {
      break;
    }

    goal = goal.trim();

    if (!goal) {
      console.log("请输入任务目标。");
      continue;
    }

    if (["exit", "quit"].includes(goal.toLowerCase())) {
      console.log("对话结束。");
      break;
    }

    const ctx = new CodeWorkflowContext({ goal, workspace_dir: WORKSPACE_DIR });
    try {
      const result = await workflow.run(ctx);
      console.log("\n--- Workflow Logs ---");
      for (const line of result.logs) {
        console.log(line);
      }
      console.log("\n--- Result ---");
      console.log(result.report || "任务完成。");
    } catch (error) {
      console.error(`\n执行失败：${error?.message || error}`);
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error(`启动失败：${error?.message || error}`);
  process.exitCode = 1;
});
