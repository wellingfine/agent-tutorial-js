// 最小 workflow 执行器。
//
// 它只负责三件事：
// - 执行当前节点
// - 读取节点返回的 action
// - 根据 action 跳到下一节点
export class Workflow {
  constructor({ startNode, maxSteps = 6 }) {
    this.startNode = startNode;
    this.maxSteps = maxSteps;
  }

  // 执行 workflow，直到没有下一跳或达到上限。
  async run(ctx) {
    let current = this.startNode;

    for (let stepIndex = 1; stepIndex <= this.maxSteps; stepIndex += 1) {
      if (!current) {
        break;
      }

      ctx.logs.push(`step=${stepIndex}, node=${current.name}`);
      const action = await current.run(ctx);
      ctx.logs.push(`node=${current.name} -> action=${action}`);

      if (action === "done") {
        break;
      }

      const nextNode = current.route(action);
      if (!nextNode) {
        ctx.logs.push(`no route for action=${action}, stop workflow`);
        break;
      }

      current = nextNode;
    }

    return ctx;
  }
}
