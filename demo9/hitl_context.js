import { CodeWorkflowContext } from "../demo8/example_context.js";

// Python 版这里同时继承 HitlContext（demo8/framework）和 CodeWorkflowContext（demo8），
// JS 没有多继承，所以用“单继承 + 字段平铺”保持同样的字段集合。
export class HitlWorkflowContext extends CodeWorkflowContext {
  constructor({ goal, workspace_dir }) {
    super({ goal, workspace_dir });

    // 来自 HitlContext 的人工确认字段
    this.approval_required = true;
    this.approved = false;
    this.rejected = false;
    this.approval_note = "";
    this.human_feedback = "";

    // 保存文件之前的内容
    this.before_snapshot = {};
  }
}
