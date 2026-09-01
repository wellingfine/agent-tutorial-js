import { AgentRuntime } from "../demo6/framework/index.js";

import { MAX_AGENT_LOOPS, WORKSPACE_DIR } from "./config.js";

/**
 * 基于 demo6 框架扩展出来的最小本地 coding agent runtime。
 *
 * 这里的重点是：
 * - 不复制第六课框架
 * - 只通过覆写少数方法做“场景化定制”
 */
export class CodingAgentRuntime extends AgentRuntime {
  constructor({ apiKey, toolRegistry, logDir = null }) {
    super({
      apiKey,
      toolRegistry,
      maxLoops: MAX_AGENT_LOOPS,
      systemMessage: null,
      logDir,
    });
    // JS 里 super() 之前不能访问 this，所以系统提示词在构造后再覆写。
    this.systemMessage = this.createCodingSystemMessage();
  }

  // 为 coding agent 定制系统提示词。
  createCodingSystemMessage() {
    return {
      role: "system",
      content:
        "你是一个最小本地 coding agent。" +
        "你的工作是先观察代码，再决定是否修改代码。" +
        "优先使用 list_files、search_text、search_files_by_name、read_text_file 来定位相关代码。" +
        "只有在你已经阅读并确认目标文件后，才进行修改。" +
        "做小规模、精确的修改时优先使用 replace_text_in_file。" +
        "如果需要创建或重写完整文件，使用 write_text_file。" +
        "不要声称代码已修改，除非你已经看到了真实工具结果。" +
        "当前工作区只允许在 demo7/project_workspace 中。" +
        "回答使用简洁清晰的中文。",
    };
  }

  /**
   * 创建 coding agent 的任务状态。
   *
   * 和 demo6 的通用 runtime 相比，这里只多了一点点项目上下文：
   * 把工作区路径放进 shared_context。
   */
  createState(goal) {
    const state = super.createState(goal);
    state.shared_context = {
      workspace_dir: WORKSPACE_DIR,
    };
    return state;
  }

  /**
   * 为 coding agent 定制运行时调度消息。
   *
   * 这里和第六课最大的区别是：
   * 提示词不再泛泛地说“完成任务”，而是明确要求先观察代码、再做修改。
   */
  buildRuntimeMessage(state) {
    return {
      role: "user",
      content:
        "你正在处理一个本地 Python 项目工作区。\n" +
        `- goal: ${JSON.stringify(state.goal ?? null)}\n` +
        `- workspace_dir: ${JSON.stringify(state.shared_context?.workspace_dir ?? null)}\n` +
        `- shared_context: ${JSON.stringify(state.shared_context ?? {})}\n` +
        `- last_tool_name: ${JSON.stringify(state.last_tool_name ?? null)}\n` +
        `- last_tool_result: ${JSON.stringify(state.last_tool_result ?? null)}\n` +
        `- completed: ${JSON.stringify(state.completed ?? false)}\n` +
        `- loop_count: ${JSON.stringify(state.loop_count ?? 0)}\n` +
        "你的目标是完成一个小规模、可验证的代码任务。" +
        "在修改前，先定位并读取相关代码。" +
        "如果任务已完成，直接给出最终答复。",
    };
  }
}
