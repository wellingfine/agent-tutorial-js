// 工作流节点基类。
//
// 这一层只保留两类能力：
// - run: 当前节点做什么
// - connect / route: 节点怎么把流程交给下一跳
export class BaseWorkflowNode {
  constructor({ name }) {
    this.name = name;
    this.nextNodes = new Map();
  }

  // 执行当前节点，并返回下一步 action。
  async run(ctx) {
    throw new Error("BaseWorkflowNode 的 run(...) 必须由子类实现。");
  }

  // 连接到下一跳节点。
  connect(action, node) {
    this.nextNodes.set(action, node);
    return node;
  }

  // 根据 action 选择下一跳节点。
  route(action) {
    return this.nextNodes.get(action) ?? null;
  }
}
