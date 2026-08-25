import { MAX_AGENT_LOOPS, MAX_HISTORY_TURNS } from "./config.js";
import { callLlm, createSystemMessage } from "./llm.js";
import { createAgentState, updateStateFromToolResult } from "./state.js";
import { buildTools, executeToolCall } from "./tools.js";

/**
 * 裁剪最近若干轮对话历史。
 *
 * 这里只裁 user / assistant / tool 这类上下文消息，不包含 system。
 */
export function trimMessages(messages, maxTurns) {
  const maxMessageCount = maxTurns * 4;
  if (messages.length > maxMessageCount) {
    return messages.slice(-maxMessageCount);
  }
  return messages;
}

/**
 * 组装本轮请求发送给模型的消息。
 *
 * 第五课里既保留 messages，也保留 state：
 * - messages 负责会话记忆和工具历史
 * - state 负责结构化任务状态
 *
 * 注意：Python 原版把“系统提示词”和“状态摘要”拆成两条 system 消息，
 * 但 LM Studio 的 chat template 只认一条 system 消息，
 * 连续两条 system 会触发 "No user query found in messages"，
 * 所以 JS 版把状态摘要合并进同一条 system 消息。
 */
export function buildRuntimeMessages(userMessages, state) {
  const statePart =
    "当前任务状态摘要：" +
    ` current_goal=${JSON.stringify(state.current_goal ?? null)};` +
    ` last_tool_name=${JSON.stringify(state.last_tool_name ?? null)};` +
    ` last_created_path=${JSON.stringify(state.last_created_path ?? null)};` +
    ` completed=${JSON.stringify(state.completed ?? false)};` +
    ` loop_count=${JSON.stringify(state.loop_count ?? 0)}.`;

  const systemMessage = createSystemMessage();
  systemMessage.content = `${systemMessage.content}\n\n${statePart}`;

  return [systemMessage, ...trimMessages(userMessages, MAX_HISTORY_TURNS)];
}

/**
 * 执行第五课的 ReAct Agent 主循环。
 *
 * 相比第四课，这里不是程序先写死下一步 action，
 * 而是模型自己根据上下文和工具结果决定是否继续调用工具。
 */
export async function runReactAgent(apiKey, userGoal, messages) {
  const tools = buildTools();
  const state = createAgentState();
  state.current_goal = userGoal;

  for (let loopIndex = 1; loopIndex <= MAX_AGENT_LOOPS; loopIndex += 1) {
    state.loop_count = loopIndex;
    const requestMessages = buildRuntimeMessages(messages, state);
    const assistantMessage = await callLlm(apiKey, requestMessages, tools);
    const toolCalls = assistantMessage.tool_calls || [];

    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? null,
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name || "unknown_tool";
        const rawArguments = toolCall.function?.arguments ?? "{}";

        console.log(`\n[循环 ${loopIndex}] 模型选择工具：${toolName}`);
        console.log(`[工具参数] ${rawArguments}`);

        const [executedToolName, toolResult] = await executeToolCall(toolCall);
        updateStateFromToolResult(state, executedToolName, toolResult);

        console.log(`[工具结果] ${JSON.stringify(toolResult)}`);

        // 工具结果既写回 messages，也同步到 state。
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      continue;
    }

    const finalAnswer = assistantMessage.content || "任务已处理完成。";
    state.completed = true;
    messages.push({ role: "assistant", content: finalAnswer });
    return finalAnswer;
  }

  throw new Error("超过最大循环次数，任务仍未完成。可以把任务描述得更具体一点再重试。");
}
