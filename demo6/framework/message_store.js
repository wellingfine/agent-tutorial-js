// 管理会话消息和历史裁剪。
//
// 第六课的目标之一，是把“消息管理”从 Agent 运行时里拆出来。
export class MessageStore {
  constructor({ maxTurns }) {
    this.maxTurns = maxTurns;
    this.messages = [];
  }

  append(message) {
    // 所有消息最终都通过这里进入存储，
    // 这样裁剪逻辑就不会散落在各个调用方里。
    this.messages.push(message);
    this.trim();
  }

  extend(newMessages) {
    // 主要给“批量回写消息”的场景留接口，
    // 虽然当前 demo 用得不多，但作为框架层抽象更完整。
    this.messages.push(...newMessages);
    this.trim();
  }

  trim() {
    // 裁剪最近若干轮消息。
    //
    // 在带工具的 ReAct 循环里，一次完整交互经常接近：
    // user -> assistant(tool_call) -> tool -> assistant
    // 所以这里按每轮约 4 条消息估算。
    const maxMessageCount = this.maxTurns * 4;
    if (this.messages.length > maxMessageCount) {
      this.messages = this.messages.slice(-maxMessageCount);
    }
  }

  snapshot() {
    // 返回当前消息快照。
    return [...this.messages];
  }
}
