# demo5（JS 版）：ReAct Demo

对应 Python 版 react_demo.py，接入 LM Studio。从“显式规划”过渡到更常见的 ReAct 风格循环。

## 本节目标

- 理解 ReAct(Reasoning + Acting) 如何在灵活性和可控性之间找平衡
- 学会同时维护 `messages` 和结构化 `state`
- 看懂一个带多工具、多轮观察的 Agent 主循环

## 目录结构

```
demo5/
  config.js        API_URL / MODEL_NAME / 循环与记忆参数 / GENERATED_FILES_DIR
  llm.js           模型调用 + req/resp 日志落盘（demo5/llm_logs/）
  state.js         结构化任务状态（createAgentState / updateStateFromToolResult）
  tools.js         三个工具 + 安全路径解析 + executeToolCall
  agent.js         ReAct 主循环（runReactAgent / buildRuntimeMessages / trimMessages）
  react_demo.js    入口：交互式 REPL
```

## 运行方式

```bash
node demo5/react_demo.js   # 或 cd demo5 && npm start
```

## 内置工具

- `create_text_file`
- `read_text_file`
- `list_files`

## 与 Python 版的差异

- `requests` → `fetch`；DeepSeek → LM Studio（无需 API Key）
- 请求参数（`thinking` / `tool_choice` / `temperature` 等）与 Python 版一致
- **system 消息合并**：Python 原版把系统提示词和状态摘要拆成两条 system 消息，
  LM Studio 的 chat template 只认一条（两条会报 "No user query found in messages"），
  JS 版把状态摘要合并进同一条 system 消息
- **`list_files(".")` 修复**：Python 原版把 "." 转成空字符串传给 `resolve_safe_path`，
  会直接报“路径不能为空”（与工具描述矛盾），JS 版修正为返回 generated_files 根目录
- 每次调用的请求参数与返回结果落盘到 `demo5/llm_logs/`
  （命名：`YYYYMMDD-hhmmss-req.json` / `YYYYMMDD-hhmmss-resp.json`）

## 学习重点

- `runReactAgent()`：主循环如何驱动整个 Agent
- `buildRuntimeMessages()`：为什么既需要 `messages`，也需要 `state`
- `updateStateFromToolResult()`：工具结果如何反哺状态

`demo4` 更像显式状态机，`demo5` 则进入更常见的自由循环式 Agent：没有完全放弃结构，而是把结构藏进运行时和状态里。
