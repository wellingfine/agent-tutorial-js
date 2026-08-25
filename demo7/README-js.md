# demo7（JS 版）：Coding Agent Demo

这一节把前面搭好的框架用在一个更具体的场景里：代码分析与代码修改。复用 `../demo6` 的框架（`ToolRegistry` / `MessageStore` / `AgentRuntime`）。

## 本节目标

- 理解 coding agent 为什么必须强调“先观察后修改”
- 学会为代码任务设计观察型工具和修改型工具
- 理解受限工作区、安全替换和最小改动的重要性

## 目录结构

```
demo7/
  config.js             WORKSPACE_DIR / MAX_HISTORY_TURNS / MAX_AGENT_LOOPS
  coding_tools.js       六个代码工具（观察型 + 修改型）
  coding_runtime.js     CodingAgentRuntime：继承 demo6 的 AgentRuntime
  coding_agent_demo.js  入口：交互式 REPL
  project_workspace/    示例 Python 项目（coding agent 的操作范围）
```

## 运行方式

先启动 LM Studio（加载 `qwen/qwen3.5-9b`，见 `../demo6/config.js`），然后：

```bash
cd demo7
node coding_agent_demo.js   # 或 npm start
```

## 内置工具

观察型工具：`list_files`、`search_text`、`search_files_by_name`、`read_text_file`

修改型工具：`replace_text_in_file`（带 `expected_occurrences` 安全校验）、`write_text_file`

## 建议练习

- 找到 `greet_user`，给空名字增加更友好的处理
- 把 `DEFAULT_THEME` 从 `light` 改成 `dark`
- 定位某段业务逻辑并让 Agent 总结它的作用

## 与 Python 版的差异

- `@tool` → `tool(handler, options)`；工具 handler 接收参数对象
- 所有工具为 async
- Agent 的作用范围严格限制在 `demo7/project_workspace`（含符号链接与路径穿越防护）
- LLM 请求/响应日志统一写入 `../demo6/llm_logs`（因为模型调用层复用 demo6 框架）
