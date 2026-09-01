[返回首页](../README.md) | [上一节：demo10](../demo10/README.md)

# demo11：MCP Agent Demo

这一节演示如何在 `demo6` 的最小框架基础上，通过 MCP 接入一个标准化外部工具服务。Agent 与天气 Server 都使用 JavaScript 实现。

## 本节目标

- 理解 MCP Server 如何把工具暴露给 Agent
- 学会通过 `McpServerConfig` 接入 stdio MCP Server
- 理解 MCP Adapter 在协议工具和本地 `ToolRegistry` 之间的转换

## 入口文件

- [mcp_agent_demo.js](mcp_agent_demo.js)

## 关键模块

- [mcp_agent_demo.js](mcp_agent_demo.js)：注册 MCP Server 并启动多轮对话
- [weather_server.js](weather_server.js)：本地天气 MCP Server
- [../demo6/framework/mcp_adapter.js](../demo6/framework/mcp_adapter.js)：MCP 工具适配
- [../demo6/framework/helpers.js](../demo6/framework/helpers.js)：Runtime 创建辅助函数

## 运行前准备

需要 Node.js 20 或更高版本。先在 LM Studio 中加载 `qwen/qwen3.5-9b` 并启动本地服务，再在仓库根目录安装两处依赖：

```bash
npm install --prefix demo6
npm install --prefix demo11
```

默认服务地址为 `http://127.0.0.1:1234`。可用 `LMSTUDIO_BASE_URL` 和可选的 `LMSTUDIO_API_KEY` 覆盖连接配置。

## 运行方式

在仓库根目录执行：

```bash
npm --prefix demo11 start
```

也可以进入目录后运行 `node mcp_agent_demo.js`。

启动后可以直接尝试：

- `帮我查一下杭州今天的天气，并给我一个出行建议。`
- `深圳天气怎么样？`
- `支持查哪些城市？`

## 本节新增能力

- 通过 `McpServerConfig` 注册 stdio MCP Server
- 在运行时读取 MCP Server 暴露的工具列表
- 把 MCP Tools 转换成 `demo6` 框架可识别的 `ToolDefinition`
- 让 Agent 优先根据真实工具结果回答天气问题

## 这个 demo 里发生了什么

`mcp_agent_demo.js` 会：

1. 创建系统消息，要求天气问题优先调用工具
2. 用当前 Node.js 可执行文件启动 `weather_server.js`
3. 通过 `McpServerConfig` 注册名为 `weather` 的 Server
4. 调用 `createRuntime()` 把 MCP Tools 装入 Runtime
5. 进入多轮对话循环

`weather_server.js` 会：

- 使用 `McpServer` 和 `StdioServerTransport` 启动本地 Server
- 暴露 `query_weather(city)` 工具
- 暴露 `list_supported_cities()` 工具
- 返回内置天气数据，不访问外部网络

`mcp_adapter.js` 会给工具名增加 Server 前缀，最终暴露给 Agent 的名称为：

- `weather_query_weather`
- `weather_list_supported_cities`

## 当前支持的天气数据

本节天气数据来自 `weather_server.js` 中的本地 `WEATHER_DATA`：

- 北京
- 上海
- 杭州
- 深圳

如果查询不支持的城市，工具会返回当前支持列表，而不是伪造数据。

## 学习重点

- MCP Server 负责按协议暴露工具
- Agent Runtime 仍然只认识本地 `ToolDefinition`
- Adapter 的职责是连接协议世界和本地运行时
- stdio Transport 使用标准输出传输 JSON-RPC，因此 Server 不能向 stdout 打印普通日志
- 本例数据完全本地化，不会发送天气查询到外部天气服务

## 日志与安全边界

模型请求和响应默认写入 `demo11/llm_logs`，可通过 `LLM_LOG_DIR` 重定向。日志可能包含用户问题和工具结果，请勿提交敏感日志。

MCP Server 是由 Agent 进程启动的本地子进程。接入其他 Server 时，应固定可信命令和参数，不要把未经校验的用户输入拼成可执行命令。

## 建议练习

- 往 `WEATHER_DATA` 中新增一个城市
- 再添加一个 MCP 工具，例如查询穿衣建议
- 观察移除“优先调用天气工具”的提示后，模型行为如何变化

## 与 Python 原版的实现差异

- DeepSeek API 改为 LM Studio 本地模型
- FastMCP 改为 `@modelcontextprotocol/sdk` 的 `McpServer.registerTool`
- 参数 Schema 使用 `zod`
- Python 解释器启动 Server 改为当前 Node.js 可执行文件启动
- 增加失败会话回滚和符号安全的城市键查询

## 与上一节相比多了什么

`demo10` 解决的是“回答前先查知识库”，`demo11` 解决的是“把标准化外部工具生态接进 Agent”。这一步让 Agent 从调用本地工具进一步走向接入外部工具协议。

[返回首页](../README.md) | [上一节：demo10](../demo10/README.md)
