import { WorkflowContext } from "./framework/index.js";

// 第八课示例自己的业务上下文。
//
// 这里放的是“本地代码修改工作流”专用字段，
// 不再污染 framework 层。
export class CodeWorkflowContext extends WorkflowContext {
  constructor({ goal, workspace_dir = "." }) {
    super({ goal });
    this.workspace_dir = workspace_dir;
    this.intent = "edit";
    this.target_file = null;
    this.search_query = null;
    this.search_hits = [];
    this.file_snapshot = {};
    this.patch_plan = {};
    this.apply_result = {};
    this.verification_result = {};
    this.report = "";
  }
}
