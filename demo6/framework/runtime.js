import { callLlm, createSystemMessage } from "./llm.js";

// 一个最小可扩展的 Agent Runtime。
//
// 第六课的核心，不是增加新能力，而是把前 1 到 5 课里已经验证过的能力
// 抽成一个更通用的运行时。
export class AgentRuntime {
  constructor({ apiKey, toolRegistry, maxLoops = 8, systemMessage = null, logDir = null }) {
    this.apiKey = apiKey;
    this.toolRegistry = toolRegistry;
    this.maxLoops = maxLoops;
    this.systemMessage = systemMessage;
    this.logDir = logDir;
  }

  // 创建通用任务状态。
  //
  // 这里有意不写死“文件路径”“文件内容”这类具体业务字段，
  // 而是通过 shared_context 给不同任务自己扩展。
  createState(goal) {
    return {
      goal,
      shared_context: {},
      last_tool_name: null,
      last_tool_result: null,
      completed: false,
      loop_count: 0,
    };
  }

  // 返回当前运行时使用的 system message。
  getSystemMessage() {
    return this.systemMessage || createSystemMessage();
  }

  // 组装单条运行时调度消息。
  //
  // 动态状态不伪装成固定规则，而是单独作为本轮调度消息交给模型。
  // 它不是固定系统规则，也不是用户原始输入，
  // 而是程序在每轮循环里主动告诉模型当前任务状态。
  buildRuntimeMessage(state) {
    return {
      role: "user",
      content:
        "当前运行时状态如下，请基于这些信息决定下一步：\n" +
        `- goal: ${JSON.stringify(state.goal ?? null)}\n` +
        `- shared_context: ${JSON.stringify(state.shared_context ?? {})}\n` +
        `- last_tool_name: ${JSON.stringify(state.last_tool_name ?? null)}\n` +
        `- last_tool_result: ${JSON.stringify(state.last_tool_result ?? null)}\n` +
        `- completed: ${JSON.stringify(state.completed ?? false)}\n` +
        `- loop_count: ${JSON.stringify(state.loop_count ?? 0)}\n` +
        "如果任务还没完成，就继续调用合适工具；如果任务已完成，就直接自然语言回答。",
    };
  }

  // 组装本轮请求的 messages。
  //
  // 这里的顺序很重要：
  // 1. system message
  // 2. 历史消息
  // 3. 当前这轮的运行时状态
  buildRuntimeMessages(messageStore, state) {
    return [
      this.getSystemMessage(),
      ...messageStore.snapshot(),
      this.buildRuntimeMessage(state),
    ];
  }

  // 根据工具结果更新通用状态。
  //
  // 工具如果返回了 context_updates，
  // runtime 会把这些信息统一合并到 shared_context。
  // 这样工具和任务状态之间就有了一个通用通信面。
  updateStateFromToolResult(state, toolName, toolResult) {
    state.last_tool_name = toolName;
    state.last_tool_result = toolResult;

    const contextUpdates = toolResult?.context_updates;
    if (
      contextUpdates &&
      typeof contextUpdates === "object" &&
      !Array.isArray(contextUpdates)
    ) {
      Object.assign(state.shared_context, contextUpdates);
    }
  }

  // 工具执行后的扩展钩子，默认不做额外处理。
  async onToolResult(state, toolName, toolResult, messageStore) {
    return undefined;
  }

  /**
   * 执行一轮完整的 Agent 任务。
   *
   * 这是第六课最重要的主循环：
   * - 组装消息
   * - 调模型
   * - 如果模型要调工具，就执行工具
   * - 把工具结果写回 messages 和 state
   * - 如果模型不再调工具，就把自然语言答复作为最终结果返回
   */
  async run(goal, messageStore) {
    const state = this.createState(goal);
    const toolsPayload = this.toolRegistry.buildToolsPayload();

    for (let loopIndex = 1; loopIndex <= this.maxLoops; loopIndex += 1) {
      state.loop_count = loopIndex;
      const requestMessages = this.buildRuntimeMessages(messageStore, state);
      const assistantMessage = await callLlm({
        apiKey: this.apiKey,
        messages: requestMessages,
        tools: toolsPayload,
        ...(this.logDir ? { logDir: this.logDir } : {}),
      });
      const toolCalls = assistantMessage.tool_calls || [];

      if (toolCalls.length > 0) {
        // 先把 assistant 的“工具调用意图”写进消息历史。
        // 这样下一轮模型能看到自己上一步是如何决策的。
        messageStore.append({
          role: "assistant",
          content: assistantMessage.content ?? null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function?.name || "unknown_tool";
          const rawArguments = toolCall.function?.arguments ?? "{}";

          console.log(`\n[循环 ${loopIndex}] 模型选择工具：${toolName}`);
          console.log(`[工具参数] ${rawArguments}`);

          const [executedToolName, toolResult] =
            await this.toolRegistry.executeToolCall(toolCall);
          this.updateStateFromToolResult(state, executedToolName, toolResult);
          await this.onToolResult(
            state,
            executedToolName,
            toolResult,
            messageStore
          );

          console.log(`[工具结果] ${JSON.stringify(toolResult)}`);

          // 再把工具真实执行结果回写成 role=tool 的消息。
          // 这是 ReAct / tool-calling 闭环里非常关键的一步。
          messageStore.append({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }

        continue;
      }

      // 如果本轮没有 tool_calls，就把 assistant 的自然语言输出
      // 当作“任务完成后的最终答复”。
      const finalAnswer = assistantMessage.content || "任务已处理完成。";
      state.completed = true;
      messageStore.append({ role: "assistant", content: finalAnswer });
      return finalAnswer;
    }

    throw new Error(
      "超过最大循环次数，任务仍未完成。可以把任务描述得更具体一点再重试。"
    );
  }
}
