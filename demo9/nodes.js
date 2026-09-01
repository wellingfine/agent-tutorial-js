import { askLlmText } from "../demo6/framework/index.js";
import { BaseWorkflowNode } from "../demo8/framework/index.js";
import { readTextFile, replaceTextInFile, writeTextFile } from "../demo8/tools.js";

import { askUser } from "./user_input.js";

// 复用 demo8 的节点（对应 Python 的 from demo8.nodes import ...）
export { ClassifyNode, InspectNode, PlanNode, VerifyNode } from "../demo8/nodes.js";

// 让终端确认信息更短一点，避免一大段代码直接糊满屏幕。
function previewText(value, maxLength = 500) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength) + "\n...省略...";
}

/**
 * 人工确认节点。
 *
 * 这个节点是第九课的核心：
 * - 模型可以给出修改计划
 * - 但真正写文件之前，必须先给人看
 * - 人工同意后，workflow 才能进入 apply 节点
 */
export class ApprovalNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "approval" });
  }

  async run(ctx) {
    if (!ctx.approval_required) {
      ctx.approved = true;
      ctx.logs.push("approval skipped");
      return "approved";
    }

    if (ctx.intent === "summary") {
      ctx.logs.push("approval skipped for summary task");
      return "approved";
    }

    const plan = ctx.patch_plan && typeof ctx.patch_plan === "object" ? ctx.patch_plan : {};
    const relativePath = String(plan.relative_path || ctx.target_file || "").trim();
    const oldText = Object.hasOwn(plan, "old_text") ? String(plan.old_text ?? "") : null;
    const newText = Object.hasOwn(plan, "new_text") ? String(plan.new_text ?? "") : null;
    const content = Object.hasOwn(plan, "content") ? plan.content : null;
    const rationale = String(plan.rationale || "模型没有提供修改理由。");

    console.log("\n--- 待确认的修改计划 ---");
    console.log(`目标文件：${relativePath || "（缺失）"}`);
    console.log(`修改理由：${rationale}`);

    if (oldText !== null) {
      console.log("\n将被替换的旧内容：");
      console.log(previewText(oldText));
    }

    if (newText !== null) {
      console.log("\n准备写入的新内容：");
      console.log(newText ? previewText(newText) : "（空字符串，将删除上述旧内容）");
    } else if (typeof content === "string") {
      console.log("\n准备写入的完整文件内容：");
      console.log(previewText(content));
    } else {
      console.log("\n警告：修改计划没有可执行的文本内容，后续执行将被拒绝。");
    }

    const answer = String(
      (await askUser("\n是否允许执行这个修改？输入 yes 执行，其他内容取消：")) ?? ""
    )
      .trim()
      .toLowerCase();

    if (answer === "yes" || answer === "y") {
      ctx.approved = true;
      ctx.approval_note = "human approved";
      ctx.logs.push("approval=approved");
      return "approved";
    }

    ctx.rejected = true;
    ctx.approval_note = "human rejected";
    ctx.human_feedback = String(
      (await askUser("可以输入取消原因，直接回车跳过：")) ?? ""
    ).trim();
    ctx.logs.push(`approval=rejected, feedback=${JSON.stringify(ctx.human_feedback)}`);
    return "rejected";
  }
}

/**
 * 带确认保护的执行节点。
 *
 * 第八课的 ApplyNode 会直接执行修改；第九课这里多了一道硬约束：
 * 没有人工确认，就不允许写文件。
 */
export class SafeApplyNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "apply" });
  }

  async run(ctx) {
    if (ctx.approval_required && !ctx.approved) {
      ctx.apply_result = {
        ok: false,
        error: "human approval is required before applying changes",
      };
      ctx.logs.push("apply blocked: approval missing");
      return "report";
    }

    const workspaceDir = String(ctx.workspace_dir);
    const plan = ctx.patch_plan && typeof ctx.patch_plan === "object" ? ctx.patch_plan : {};
    const relativePath = String(plan.relative_path || ctx.target_file || "").trim();
    const hasOldText = Object.hasOwn(plan, "old_text");
    const hasNewText = Object.hasOwn(plan, "new_text");
    const hasContent = Object.hasOwn(plan, "content");
    const oldText = hasOldText ? String(plan.old_text ?? "") : "";
    const newText = hasNewText ? String(plan.new_text ?? "") : "";
    const expectedOccurrences = Number(plan.expected_occurrences ?? 1);

    if (relativePath) {
      ctx.before_snapshot = await readTextFile({
        workspace_dir: workspaceDir,
        relative_path: relativePath,
      });
      ctx.logs.push(`backup_before_apply=${ctx.before_snapshot.ok}`);
    }

    let result;
    if (!relativePath) {
      result = { ok: false, error: "修改计划缺少 relative_path。" };
    } else if (hasOldText && hasNewText && oldText) {
      result = await replaceTextInFile({
        workspace_dir: workspaceDir,
        relative_path: relativePath,
        old_text: oldText,
        new_text: newText,
        expected_occurrences: expectedOccurrences,
      });
    } else if (hasContent && typeof plan.content === "string") {
      result = await writeTextFile({
        workspace_dir: workspaceDir,
        relative_path: relativePath,
        content: plan.content,
        overwrite: true,
      });
    } else {
      result = {
        ok: false,
        error: "修改计划必须提供非空 old_text 和显式 new_text，或提供字符串 content。",
      };
    }

    ctx.apply_result = result;
    ctx.logs.push(`apply_result=${JSON.stringify(result)}`);
    return "verify";
  }
}

// 生成包含确认结果的最终报告。
export class HitlReportNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "report" });
  }

  async run(ctx) {
    if (ctx.rejected) {
      ctx.report =
        "任务已取消：修改计划没有通过人工确认，所以没有写入任何文件。" +
        `\n取消原因：${ctx.human_feedback || "未填写"}`;
      return "done";
    }

    const systemPrompt =
      "你是一个 workflow 报告生成器。" +
      "请基于执行日志、审批结果、修改结果和验证结果，输出一段简洁中文总结。";
    const userContent =
      `用户目标：${ctx.goal}\n` +
      `意图：${ctx.intent}\n` +
      `审批结果：approved=${ctx.approved}, rejected=${ctx.rejected}, note=${ctx.approval_note}\n` +
      `修改计划：${JSON.stringify(ctx.patch_plan)}\n` +
      `执行结果：${JSON.stringify(ctx.apply_result)}\n` +
      `验证结果：${JSON.stringify(ctx.verification_result)}\n` +
      `日志：${JSON.stringify(ctx.logs)}\n`;
    ctx.report = await askLlmText(systemPrompt, userContent, { logDir: ctx.log_dir });
    return "done";
  }
}
