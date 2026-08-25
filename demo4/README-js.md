# demo4（JS 版）：Planning Demo

对应 [planning_demo.py](planning_demo.py)，接入 LM Studio。把“先做什么、后做什么”显式化，让模型不再直接冲着结果输出，而是先决定下一步动作。

## 本节目标

- 理解 Planning 为什么适合做结构化任务推进
- 学会把任务拆成多个步骤和动作
- 理解“模型负责决策，程序负责执行”的边界

## 运行方式

```bash
node demo4/planning_demo.js
```

## 本节新增能力

- 把任务拆成多个步骤
- 维护结构化状态 `state`
- 让模型只返回 JSON 决策（`callPlanner` + `parseJsonResponse`）
- 通过动作枚举控制执行流程
- 在 `decide_path -> draft_content -> create_file -> finish` 之间推进任务
- 每次调用的请求参数与返回结果落盘到 `demo4/llm_logs/`

## 学习重点

- `createSystemMessage()`：如何严格约束输出格式和动作集合
- `buildStateMessage()`：如何把当前状态整理给模型
- `callPlanner()`：如何把“规划器”当作一个只做决策的模型调用
- `runTaskAgent()`：如何在程序侧接管执行流程

这一节最值得体会的，是“模型负责决策，程序负责执行”的边界感。

## 与 Python 版的差异

- `requests` → `fetch`；DeepSeek → LM Studio（无需 API Key）
- 请求参数（`thinking` / `max_tokens` / `temperature`）与 Python 版一致
