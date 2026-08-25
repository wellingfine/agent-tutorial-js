# demo1（JS 版）：Hello World

对应 [hello_world.py](hello_world.py)，接入 LM Studio。目标只有一个：把一次最基础的大模型调用跑通。

## 本节目标

- 理解一次最小 LLM 调用需要哪些消息和参数
- 学会用 `fetch` 请求 LM Studio 的 OpenAI 兼容 Chat API
- 看懂模型响应里的内容和 token 使用情况

## 运行方式

先启动 LM Studio（加载 `qwen/qwen3.5-9b`），然后：

```bash
node demo1/hello_world.js
```

## 本节新增能力

- 组织 `system` 和 `user` 消息
- 发起一次完整的 Chat Completions 风格请求
- 读取 `choices[0].message.content`
- 查看一次请求的 token 使用信息
- 每次调用的请求参数与返回结果落盘到 `demo1/llm_logs/`
  （命名：`YYYYMMDD-hhmmss-req.json` / `YYYYMMDD-hhmmss-resp.json`）

## 与 Python 版的差异

- `requests` → Node 18+ 内置 `fetch`
- DeepSeek API（需 API Key）→ LM Studio 本地接口（无需 Key）
- 请求参数（`thinking` / `max_tokens` / `temperature` 等）与 Python 版保持一致
