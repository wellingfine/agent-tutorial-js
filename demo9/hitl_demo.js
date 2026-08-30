import { getApiKey } from "../demo6/framework/index.js";
import { Workflow } from "../demo8/framework/index.js";

// demo9 复用 demo6 框架的模型调用层，LLM req/resp 日志也统一写在 demo6/llm_logs。
import { LLM_LOG_DIR } from "../demo6/config.js";
import { MAX_WORKFLOW_STEPS, WORKSPACE_DIR } from "./config.js";
import { HitlWorkflowContext } from "./hitl_context.js";
import {
  ApprovalNode,
  ClassifyNode,
  HitlReportNode,
  InspectNode,
  PlanNode,
  SafeApplyNode,
  VerifyNode,
} from "./nodes.js";
import { askUser } from "./user_input.js";

function buildWorkflow() {
  /**
   * 构造带 HITL 的代码修改 workflow。
   *
   * 第九课相比第八课只多插入一个关键节点：
   * plan -> approval -> apply
   */
  const classify = new ClassifyNode({ name: "classify" });
  const inspect = new InspectNode({ name: "inspect" });
  const plan = new PlanNode({ name: "plan" });
  const approval = new ApprovalNode({ name: "approval" });
  const applyNode = new SafeApplyNode({ name: "apply" });
  const verify = new VerifyNode({ name: "verify" });
  const report = new HitlReportNode({ name: "report" });

  classify.connect("inspect", inspect);
  inspect.connect("plan", plan);
  inspect.connect("report", report);
  plan.connect("apply", approval);
  approval.connect("approved", applyNode);
  approval.connect("rejected", report);
  applyNode.connect("verify", verify);
  verify.connect("report", report);

  return new Workflow({ startNode: classify, maxSteps: MAX_WORKFLOW_STEPS });
}

async function main() {
  getApiKey();

  console.log("HITL Demo（JS 版）已启动。输入 exit 或 quit 结束。");
  console.log("你可以试试：帮我找到 utils.py 里的 greet_user，并把空名字处理改得更友好。");
  console.log(`工作区目录：${WORKSPACE_DIR}`);
  console.log(`LLM 请求/响应日志目录：${LLM_LOG_DIR}`);

  const workflow = buildWorkflow();

  while (true) {
    const goal = (await askUser("\n你：")) ?? "";
    const trimmedGoal = goal.trim();

    if (!trimmedGoal) {
      console.log("请输入任务目标。");
      continue;
    }

    if (["exit", "quit"].includes(trimmedGoal.toLowerCase())) {
      console.log("对话结束。");
      break;
    }

    const ctx = new HitlWorkflowContext({ goal: trimmedGoal, workspace_dir: WORKSPACE_DIR });
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
}

main().catch((error) => {
  console.error(`启动失败：${error?.message || error}`);
  process.exitCode = 1;
});
