# demo6（JS 版）：Framework Demo

这是 [agent-tutorial demo6](https://github.com/) 的 JavaScript 移植版。重点不再是“再多一个 Agent 能力”，而是把通用逻辑抽象出来，接入 **LM Studio** 本地模型。

## 本节目标

- 理解一个最小 Agent 框架通常会拆成哪些层
- 学会把工具注册、消息存储、运行时循环解耦
- 为后面的 coding agent、workflow、MCP 接入打好框架基础

## 目录结构

```
demo6/
  config.js            环境参数集中配置（API_URL / MODEL_NAME / 日志目录等）
  builtin_tools.js     内置文件工具（create_text_file / read_text_file / list_files）
  framework_demo.js    入口：交互式 REPL
  framework/
    index.js           框架统一出口
    agent_types.js     ToolDefinition
    decorators.js      tool(...) 声明工具（对应 Python 的 @tool）
    helpers.js         createRuntime(...)
    llm.js             模型通信层（LM Studio）+ req/resp 日志落盘
    mcp_adapter.js     MCP stdio 工具适配（可选，懒加载）
    message_store.js   会话消息与历史裁剪
    runtime.js         AgentRuntime：ReAct 主循环
    tool_registry.js   工具注册、schema 暴露与执行
  generated_files/     工具可写目录（运行时自动创建）
  llm_logs/            LLM 请求/响应日志（运行时自动创建）
```

## 运行方式

1. 启动 LM Studio，加载 `qwen/qwen3.5-9b`，并开启本地服务器
   （默认地址 `http://127.0.0.1:1234`，可在 `config.js` 修改）
2. 启动 demo：

```bash
cd demo6
node framework_demo.js   # 或 npm start
```

LM Studio 默认不需要 API Key；若开启了鉴权，可设置环境变量：

```bash
export LMSTUDIO_API_KEY="你的 Key"
```

## LLM 请求/响应日志

每次调用大模型，输入参数与返回结果都会写入 `demo6/llm_logs/`：

- 命名格式：`YYYYMMDD-hhmmss-req.json` / `YYYYMMDD-hhmmss-resp.json`
- 同一次调用的 req / resp 共享同一时间戳前缀，方便配对
- 同一秒内多次调用会追加序号（如 `20260825-143025-2-req.json`）避免覆盖
- `req.json` 是发往模型的完整请求体；`resp.json` 是模型返回的完整响应
- 日志目录默认为 `demo6/llm_logs`，可用环境变量 `LLM_LOG_DIR` 重定向
- 后续 demo（7-11）复用本框架的模型调用层，chat / embedding 日志也统一写在这里

## 本节新增能力（与 Python 版一致）

- 封装 `ToolRegistry`
- 封装 `MessageStore`
- 通过 `tool(handler, options)` 声明工具
- 通过 `createRuntime(...)` 快速组装一个最小 Agent Runtime
- 让工具通过 `context_updates` 回写共享上下文

## MCP 接入（可选）

`framework/mcp_adapter.js` 懒加载 `@modelcontextprotocol/sdk`，不用 MCP 时无需安装。需要时：

```bash
cd demo6
npm install @modelcontextprotocol/sdk
```

然后在 `createRuntime({ mcpServers: [new McpServerConfig({ name, command, args })] })` 中传入即可。

## 与 Python 版的主要差异

| Python 版 | JS 版 |
| --- | --- |
| `@tool` 装饰器 + 类型注解自动生成 schema | `tool(handler, options)`，通过 `parameterDescriptions` + `parameterTypes` 声明 schema（JS 无类型注解） |
| 工具函数按关键字参数调用（`**kwargs`） | 工具 handler 统一接收一个参数对象 |
| `create_runtime(...)` 同步 | `createRuntime(...)` 为 async（MCP 加载需要异步握手） |
| DeepSeek API（需要 API Key） | LM Studio 本地接口（无需 Key） |
| 无请求日志 | 每次调用落盘 req/resp 日志到 `llm_logs/` |

## 建议练习

- 新增一个你自己的 `tool(...)`
- 给 Runtime 增加一个更严格的循环次数限制
- 观察 `MessageStore` 和 `ToolRegistry` 如果换实现，会影响哪些地方
