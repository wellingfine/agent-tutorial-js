# demo2（JS 版）：Memory Demo

对应 [memory_demo.py](memory_demo.py)，接入 LM Studio。程序不再只做一次调用，而是进入交互循环，并保留对话历史。

## 本节目标

- 理解多轮对话为什么本质上是维护 `messages`
- 学会把历史轮次不断放回上下文
- 理解短期记忆和消息裁剪的意义

## 运行方式

```bash
node demo2/memory_demo.js
```

## 本节新增能力

- 维护 `messages` 列表
- 把上一轮的 `assistant` 回复也放回上下文
- 通过裁剪消息列表模拟“短期记忆”（`trimMessages`：永远保留 system + 最近 4 轮）
- 每次调用的请求参数与返回结果落盘到 `demo2/llm_logs/`

## 学习重点

- `createSystemMessage()`：持续约束助手身份
- `trimMessages()`：如何只保留最近几轮消息
- `main()` 中的 while 循环：消息是如何追加和回写的

多轮对话不神秘，本质上就是反复把历史消息一起发给模型；所谓 memory，在早期 demo 里主要就是“保留上下文”。

## 与 Python 版的差异

- `requests` → `fetch`；DeepSeek → LM Studio（无需 API Key）
- 请求参数（`thinking` / `max_tokens` / `temperature`）与 Python 版一致
