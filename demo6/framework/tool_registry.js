import { ToolDefinition } from "./agent_types.js";

// 管理工具注册、schema 暴露和工具执行。
//
// 这是第六课里非常核心的一层抽象：
// - 上层 runtime 不直接关心每个工具怎么实现
// - 下层工具函数也不需要知道 runtime 的细节
export class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  // 把 ToolDefinition 或 tool(...) 包装过的函数统一转换成 ToolDefinition。
  // 这样框架同时支持两种定义方式：
  // - 显式 ToolDefinition
  // - 更轻量的 tool(handler, options)
  _normalizeTool(tool) {
    if (tool instanceof ToolDefinition) {
      return tool;
    }

    const toolDefinition = tool?.__tool_definition__;
    if (toolDefinition instanceof ToolDefinition) {
      return toolDefinition;
    }

    throw new TypeError("register(...) 只接受 ToolDefinition 或使用 tool(...) 包装过的函数。");
  }

  register(tool) {
    const toolDefinition = this._normalizeTool(tool);
    this._tools.set(toolDefinition.name, toolDefinition);
  }

  registerMany(...tools) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  // 从一个模块中批量注册所有带工具定义的函数。
  // 这样工具模块可以只负责定义函数，注册阶段只需要传模块本身。
  registerToolsFromModule(toolModule) {
    for (const value of Object.values(toolModule)) {
      if (value?.__tool_definition__ instanceof ToolDefinition) {
        this.register(value);
      }
    }
  }

  // 生成发送给模型的 tools payload。
  // 这一步相当于把 JS 世界里的工具定义，
  // 翻译成 LLM 能理解的 OpenAI/LM Studio tools 格式。
  buildToolsPayload() {
    const payload = [];

    for (const tool of this._tools.values()) {
      payload.push({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      });
    }

    return payload;
  }

  /**
   * 执行模型返回的单个 tool_call，返回 [toolName, toolResult]。
   *
   * 这里做了几件事：
   * 1. 把 arguments 从 JSON 字符串解析成对象
   * 2. 找到对应 handler 并执行
   * 3. 对照 schema 校验必填参数（JS 无法像 Python 那样靠函数签名抛 KeyError）
   */
  async executeToolCall(toolCall) {
    const functionInfo = toolCall.function || {};
    const toolName = functionInfo.name || "unknown_tool";
    const rawArguments = functionInfo.arguments ?? "{}";

    // 模型返回的参数是字符串，不是现成对象，所以这里必须先 parse。
    let arguments_ = {};
    try {
      arguments_ = JSON.parse(rawArguments || "{}");
    } catch (error) {
      return [
        toolName,
        {
          ok: false,
          error: `工具参数不是合法 JSON：${error.message}`,
          raw_arguments: rawArguments,
        },
      ];
    }

    if (typeof arguments_ !== "object" || arguments_ === null || Array.isArray(arguments_)) {
      return [
        toolName,
        {
          ok: false,
          error: "工具参数必须是 JSON 对象。",
          raw_arguments: rawArguments,
        },
      ];
    }

    const tool = this._tools.get(toolName);
    if (!tool) {
      return [
        toolName,
        {
          ok: false,
          error: `未知工具：${toolName}`,
          arguments: arguments_,
        },
      ];
    }

    const required =
      tool.parameters?.required || Object.keys(tool.parameters?.properties || {});
    for (const paramName of required) {
      if (arguments_[paramName] === undefined) {
        return [
          toolName,
          {
            ok: false,
            error: `缺少必要参数：${paramName}`,
            arguments: arguments_,
          },
        ];
      }
    }

    // 工具 handler 统一接收一个参数对象（等价于 Python 的 **kwargs）。
    let result;
    try {
      result = await tool.handler(arguments_);
    } catch (error) {
      return [
        toolName,
        {
          ok: false,
          error: `工具执行出错：${error?.message || error}`,
          arguments: arguments_,
        },
      ];
    }

    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      return [
        toolName,
        {
          ok: false,
          error: "工具返回值必须是对象。",
          arguments: arguments_,
        },
      ];
    }

    return [toolName, result];
  }
}
