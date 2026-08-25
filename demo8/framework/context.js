// 工作流上下文。
//
// 这是框架层的最小共享状态对象：
// - goal: 当前任务目标
// - shared: 节点之间共享的通用字典
// - logs: 工作流日志
export class WorkflowContext {
  constructor({ goal, shared = {}, logs = [] }) {
    this.goal = goal;
    this.shared = shared;
    this.logs = logs;
  }
}

// 带人工打断能力的通用 workflow 上下文。
//
// - approval_required: 当前 workflow 是否需要人工确认
// - approved: 人工是否批准
// - rejected: 人工是否拒绝
// - approval_note: 框架或节点写入的确认备注
// - human_feedback: 人工拒绝或补充时留下的反馈
export class HitlContext extends WorkflowContext {
  constructor({
    goal,
    shared = {},
    logs = [],
    approval_required = true,
    approved = false,
    rejected = false,
    approval_note = "",
    human_feedback = "",
  }) {
    super({ goal, shared, logs });
    this.approval_required = approval_required;
    this.approved = approved;
    this.rejected = rejected;
    this.approval_note = approval_note;
    this.human_feedback = human_feedback;
  }
}
