import { ToolDefinition } from "./agent_types.js";

// 根据 parameterDescriptions / parameterTypes 生成简单 JSON Schema。
// Python 版靠函数签名的类型注解推导；JS 没有类型注解，
// 所以类型通过 parameterTypes 显式声明（缺省为 "string"）。
function buildParametersFromOptions({
  parameterDescriptions = {},
  parameterTypes = {},
  required = null,
} = {}) {
  const properties = {};
  const requiredNames = [];

  for (const [paramName, description] of Object.entries(parameterDescriptions)) {
    properties[paramName] = {
      type: parameterTypes[paramName] || "string",
      description: description || `Parameter: ${paramName}`,
    };
    requiredNames.push(paramName);
  }

  const schema = { type: "object", properties };

  const finalRequired = Array.isArray(required) ? required : requiredNames;
  if (finalRequired.length > 0) {
    schema.required = finalRequired;
  }

  return schema;
}

function decorate(handler, options) {
  if (typeof handler !== "function") {
    throw new TypeError("tool(...) 需要一个函数作为 handler。");
  }

  // 如果用户没有显式传 name / description / parameters，
  // 就尽量从函数本身推导出一个“够用”的工具定义。
  const toolName = options.name || handler.name || "anonymous_tool";
  const toolDescription = options.description || `Tool: ${toolName}`;
  const toolParameters =
    options.parameters ||
    buildParametersFromOptions({
      parameterDescriptions: options.parameterDescriptions,
      parameterTypes: options.parameterTypes,
      required: options.required,
    });

  // 工具定义被挂到函数对象本身上，
  // 这样 ToolRegistry 扫描模块时就能自动发现它。
  handler.__tool_definition__ = new ToolDefinition({
    name: toolName,
    description: toolDescription,
    parameters: toolParameters,
    handler,
  });

  return handler;
}

/**
 * 把一个函数声明为工具（对应 Python 版的 @tool 装饰器）。
 *
 * 用法一：tool(handler, options?)
 * 用法二：tool(options)(handler)   // 装饰器风格
 *
 * options:
 *   name                  工具名（默认取函数名）
 *   description           工具描述
 *   parameters            完整 JSON Schema（可选，优先级最高）
 *   parameterDescriptions { 参数名: 描述 }
 *   parameterTypes        { 参数名: "string" | "integer" | "number" | "boolean" | "object" | "array" }
 *   required              必填参数名数组（默认全部参数必填）
 *
 * handler 统一接收一个“参数对象”（等价于 Python 的 **kwargs），
 * 返回值必须是普通对象。
 */
export function tool(handlerOrOptions, maybeOptions) {
  if (typeof handlerOrOptions === "function") {
    return decorate(handlerOrOptions, maybeOptions || {});
  }

  const options = handlerOrOptions || {};
  return (handler) => decorate(handler, options);
}
