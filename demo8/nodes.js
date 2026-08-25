import { askLlmJson, askLlmText } from "../demo6/framework/index.js";

import { CodeWorkflowContext } from "./example_context.js";
import { BaseWorkflowNode } from "./framework/index.js";
import {
  listFiles,
  readTextFile,
  replaceTextInFile,
  searchText,
  writeTextFile,
} from "./tools.js";

/**
 * 把用户目标分类为 summary / edit。
 *
 * 这是 workflow 的第一步：
 * 先把任务分成“只读观察”还是“需要修改”两类，
 * 后面的节点再走不同路径。
 */
export class ClassifyNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "classify" });
  }

  async run(ctx) {
    const systemPrompt =
      "你是一个 workflow 分类器。" +
      "请根据用户目标输出 JSON，字段如下：" +
      "intent (summary 或 edit), target_file, search_query, reason。" +
      "如果用户明显要求修改代码或文件，intent 选择 edit。" +
      "如果用户只是想了解、总结或检查，intent 选择 summary。";
    const data = await askLlmJson(systemPrompt, `用户目标：${ctx.goal}`);

    ctx.intent = String(data.intent || "edit");
    ctx.target_file = data.target_file || null;
    ctx.search_query = data.search_query || null;
    ctx.logs.push(`classify=${JSON.stringify(data)}`);
    return "inspect";
  }
}

/**
 * 先观察工作区。
 *
 * workflow 的第二步先看：
 * - 当前目录有什么
 * - 目标文件长什么样
 * - 搜索关键词命中了哪些地方
 */
export class InspectNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "inspect" });
  }

  async run(ctx) {
    const workspaceDir = String(ctx.workspace_dir);

    const listing = await listFiles({ workspace_dir: workspaceDir, relative_dir: "." });
    ctx.logs.push(`workspace_list_count=${(listing.items || []).length}`);

    if (ctx.search_query) {
      const hits = await searchText({
        workspace_dir: workspaceDir,
        query: ctx.search_query,
        relative_dir: ".",
      });
      ctx.search_hits = hits.matches || [];
      ctx.logs.push(`search_hits=${ctx.search_hits.length}`);
    }

    if (ctx.target_file) {
      ctx.file_snapshot = await readTextFile({
        workspace_dir: workspaceDir,
        relative_path: ctx.target_file,
      });
      ctx.logs.push(`snapshot_path=${ctx.file_snapshot.path}`);
    }

    if (ctx.intent === "summary") {
      return "report";
    }
    return "plan";
  }
}

/**
 * 让模型根据观察结果生成一个具体修改计划。
 *
 * 这一步的目标不是让模型直接修改，而是先把修改意图收敛成
 * 可执行的 patch plan。
 */
export class PlanNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "plan" });
  }

  async run(ctx) {
    const systemPrompt =
      "你是一个 workflow 规划器。" +
      "根据用户目标、文件快照和搜索结果，输出 JSON。" +
      "字段如下：relative_path, old_text, new_text, expected_occurrences, rationale。" +
      "只做一个小而精确的改动。";
    const userContent =
      `用户目标：${ctx.goal}\n` +
      `目标文件：${ctx.target_file}\n` +
      `文件快照：${JSON.stringify(ctx.file_snapshot)}\n` +
      `搜索结果：${JSON.stringify(ctx.search_hits)}\n`;
    const plan = await askLlmJson(systemPrompt, userContent);
    ctx.patch_plan = plan;
    ctx.logs.push(`plan=${JSON.stringify(plan)}`);
    return "apply";
  }
}

// 执行修改计划。
export class ApplyNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "apply" });
  }

  async run(ctx) {
    const workspaceDir = String(ctx.workspace_dir);
    const relativePath = String(ctx.patch_plan?.relative_path || ctx.target_file || "");
    const oldText = String(ctx.patch_plan?.old_text || "");
    const newText = String(ctx.patch_plan?.new_text || "");
    const expectedOccurrences = Number(ctx.patch_plan?.expected_occurrences || 1);

    let result;
    if (oldText && newText) {
      result = await replaceTextInFile({
        workspace_dir: workspaceDir,
        relative_path: relativePath,
        old_text: oldText,
        new_text: newText,
        expected_occurrences: expectedOccurrences,
      });
    } else {
      result = await writeTextFile({
        workspace_dir: workspaceDir,
        relative_path: relativePath,
        content: String(ctx.patch_plan?.content || ""),
        overwrite: true,
      });
    }

    ctx.apply_result = result;
    ctx.logs.push(`apply_result=${JSON.stringify(result)}`);
    return "verify";
  }
}

// 读取文件并确认修改结果。
export class VerifyNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "verify" });
  }

  async run(ctx) {
    if (!ctx.apply_result?.ok) {
      ctx.verification_result = { ok: false, error: "apply failed" };
      return "report";
    }

    const targetPath = String(ctx.apply_result?.path || ctx.target_file || "");
    const snapshot = await readTextFile({
      workspace_dir: String(ctx.workspace_dir),
      relative_path: targetPath,
    });
    ctx.verification_result = snapshot;
    ctx.logs.push(`verification=${snapshot.ok}`);
    return "report";
  }
}

/**
 * 把 workflow 过程总结成最终答案。
 *
 * 最终输出不是工具日志，而是对用户可读的简短结果。
 */
export class ReportNode extends BaseWorkflowNode {
  constructor({ name } = {}) {
    super({ name: name || "report" });
  }

  async run(ctx) {
    const systemPrompt =
      "你是一个 workflow 报告生成器。" +
      "基于执行日志、修改结果和验证结果，输出一段简洁中文总结。";
    const userContent =
      `用户目标：${ctx.goal}\n` +
      `意图：${ctx.intent}\n` +
      `修改计划：${JSON.stringify(ctx.patch_plan)}\n` +
      `执行结果：${JSON.stringify(ctx.apply_result)}\n` +
      `验证结果：${JSON.stringify(ctx.verification_result)}\n` +
      `日志：${JSON.stringify(ctx.logs)}\n`;
    ctx.report = await askLlmText(systemPrompt, userContent);
    return "done";
  }
}
