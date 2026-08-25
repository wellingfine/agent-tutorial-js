# demo11（JS 版）：MCP Agent Demo

在 `demo6` 的最小框架基础上，通过 MCP 接入一个标准化外部工具服务。weather server 用 JS 版 MCP SDK 重写（`@modelcontextprotocol/sdk` + `zod`）。

## 本节目标

- 理解 MCP Server 是怎么把工具暴露给 Agent 的
- 学会通过 `McpServerConfig` 把一个 stdio MCP server 接入 Runtime
- 理解 MCP adapter 在“协议世界”和“本地 ToolRegistry”之间做了什么转换

## 目录结构

```
demo11/
  mcp_agent_demo.js   入口：注册 weather MCP server 并进入多轮对话
  weather_server.js   MCP Server：暴露 query_weather / list_supported_cities
```

## 运行方式

```bash
cd demo11
node mcp_agent_demo.js   # 或 npm start
```

启动后可以直接试：

- `帮我查一下杭州今天的天气，并给我一个出行建议。`
- `深圳天气怎么样？`
- `支持查哪些城市？`

## 这个 demo 里发生了什么

`mcp_agent_demo.js` 会：

1. 创建系统消息，要求遇到天气问题优先调用工具
2. 通过 `McpServerConfig({ name: "weather", command: process.execPath, args: [weather_server.js] })` 注册 server（对应 Python 版的 `sys.executable + weather_server.py`）
3. 调用 `createRuntime(...)`，把 MCP tools 一起装进 Runtime
4. 进入多轮对话循环

`weather_server.js` 会：

- 用 `McpServer` 启动一个 stdio MCP Server（注意：stdio transport 占用 stdout，不能往 stdout 打日志）
- 暴露 `query_weather(city)` 和 `list_supported_cities()` 两个工具
- 返回内置天气数据（北京 / 上海 / 杭州 / 深圳），不访问外部网络

接入层里，`../demo6/framework/mcp_adapter.js` 会把这些工具转换成 Runtime 可调用的形式，最终暴露给 Agent 的工具名带 server 前缀：`weather_query_weather`、`weather_list_supported_cities`。

## 与 Python 版的差异

- FastMCP → `@modelcontextprotocol/sdk` 的 `McpServer.registerTool`（zod 声明参数）
- LLM 请求/响应日志统一写入 `../demo6/llm_logs`

## 建议练习

- 往 `WEATHER_DATA` 里新增一个城市
- 再添加一个新的 MCP 工具，比如“查询穿衣建议”
- 观察如果去掉系统提示里“优先调用天气工具”的约束，模型行为会有什么变化
