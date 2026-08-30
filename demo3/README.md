# demo3（JS 版）：Tool Calling Demo

对应 Python 版 tool_demo.py，接入 LM Studio。让模型不只“回答”，还可以“做事”。

## 本节目标

- 理解工具 schema 是怎么描述给模型的
- 学会执行模型发起的工具调用
- 理解工具结果如何反馈回模型，形成闭环

## 运行方式

```bash
node demo3/tool_demo.js
```

## 本节新增能力

- 定义 `tools`（`buildTools`）
- 让模型自动决定是否调用工具（`tool_choice: auto`）
- 执行本地工具函数（`create_text_file`，带安全路径限制）
- 把工具执行结果再反馈给模型，让模型生成最终回复（`runAgentTurn`）
- 限制工具只能写入 `demo3/generated_files`
- 每次调用的请求参数与返回结果落盘到 `demo3/llm_logs/`

## 内置工具

- `create_text_file`

## 学习重点

- `buildTools()`：工具 schema 是怎么描述给模型的
- `executeToolCall()`：如何解析模型生成的 JSON 参数
- `resolveSafePath()`：如何做安全路径限制
- `runAgentTurn()`：工具调用和模型回复如何形成闭环

Agent 之所以“像代理”，不是因为它会聊天，而是因为它有了可以执行的动作空间。

## 与 Python 版的差异

- `requests` → `fetch`；DeepSeek → LM Studio（无需 API Key）
- 请求参数（`thinking` / `tool_choice` / `temperature` 等）与 Python 版一致
