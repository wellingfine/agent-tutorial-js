/**
 * 创建当前任务的状态对象。
 *
 * 第五课里，真实一点的 Agent 会同时维护：
 * - messages: 给模型看的会话上下文
 * - state: 给程序判断的结构化事实
 */
export function createAgentState() {
  return {
    current_goal: null,
    last_tool_name: null,
    last_tool_result: null,
    last_created_path: null,
    last_read_content: null,
    completed: false,
    loop_count: 0,
  };
}

// 把最近一次工具调用结果同步进 state。
export function updateStateFromToolResult(state, toolName, toolResult) {
  state.last_tool_name = toolName;
  state.last_tool_result = toolResult;

  if (toolName === "create_text_file" && toolResult?.ok) {
    state.last_created_path = toolResult.path;
  }

  if (toolName === "read_text_file" && toolResult?.ok) {
    state.last_read_content = toolResult.content;
  }
}
