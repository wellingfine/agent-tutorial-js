// 描述一个可注册到运行时中的工具。
export class ToolDefinition {
  constructor({ name, description, parameters, handler }) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.handler = handler;
  }
}
