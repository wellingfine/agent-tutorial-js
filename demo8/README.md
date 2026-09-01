[返回首页](../README.md) | [上一节：demo7](../demo7/README.md) | [下一节：demo9](../demo9/README.md)

# demo8：Workflow Agent Demo

这一节继续沿着 `demo6`、`demo7` 往前走，但重点从“通用 Runtime”切到“固定工作流编排”。模型调用复用 `demo6`，工作流框架由本节实现。

## 本节目标

- 理解什么场景适合用固定 workflow 而不是自由循环 Agent
- 学会把任务拆成固定节点和显式路由
- 理解验证节点在稳定任务流中的价值

## 入口文件

- [workflow_demo.js](workflow_demo.js)

## 关键模块

- [framework/workflow.js](framework/workflow.js)：工作流执行器
- [framework/node.js](framework/node.js)：节点基类与路由
- [framework/context.js](framework/context.js)：通用上下文
- [example_context.js](example_context.js)：代码任务上下文
- [nodes.js](nodes.js)：六个业务节点
- [tools.js](tools.js)：受限工作区文件工具

## 运行前准备

需要 Node.js 20 或更高版本。先在 LM Studio 中加载 `qwen/qwen3.5-9b` 并启动本地服务，再在仓库根目录执行：

```bash
npm install --prefix demo6
```

默认服务地址为 `http://127.0.0.1:1234`。可用 `LMSTUDIO_BASE_URL` 和可选的 `LMSTUDIO_API_KEY` 覆盖连接配置。

## 运行方式

在仓库根目录执行：

```bash
npm --prefix demo8 start
```

也可以进入目录后运行 `node workflow_demo.js`。

## 本节新增能力

- 把任务拆成一组固定节点
- 让节点通过 `action` 决定下一跳
- 把 `classify -> inspect -> plan -> apply -> verify -> report` 串成工作流
- 把 workflow 能力和业务节点实现分层
- 在代码修改任务里显式加入验证步骤
- 把框架层上下文抽象成通用的 `WorkflowContext`

## 典型工作流

1. `ClassifyNode` 判断这是总结类还是修改类任务
2. `InspectNode` 查看目录、文件快照和搜索结果
3. `PlanNode` 产出一个小而精确的修改计划
4. `ApplyNode` 校验计划并执行精确替换或显式整文件写入
5. `VerifyNode` 重新读取文件，确认写入结果
6. `ReportNode` 输出最终总结

总结类任务会从 `InspectNode` 直接进入 `ReportNode`，不会写文件。

## 学习重点

和 `demo7` 相比，这一节更强调：

- 任务流转是显式节点，不只是自由循环
- 每个节点职责更单一，更适合扩展和调试
- 对于需要稳定步骤、清晰审计链路的任务，workflow 往往比自由 Agent 更容易控制
- 模型输出必须在落盘前做字段和路径校验，不能把不完整计划当成空文件写入

## 示例工作区

- [project_workspace/app.py](project_workspace/app.py)
- [project_workspace/settings.py](project_workspace/settings.py)
- [project_workspace/utils.py](project_workspace/utils.py)
- [project_workspace/README.md](project_workspace/README.md)

这里的 `.py` 文件是工作流的示例操作对象，不是本 demo 的 Python 实现。

## 日志与安全边界

模型请求和响应默认写入 `demo8/llm_logs`，可通过 `LLM_LOG_DIR` 重定向。日志可能包含用户目标、文件快照和源代码，请勿提交敏感日志。

`VerifyNode` 当前只重新读取目标文件，属于最小验证示例，不会自动运行语法检查或测试。真实项目应增加测试、静态检查和失败回滚。

## 建议练习

- 在现有流程中新增一个 `risk check` 节点
- 对比自由 Agent 与固定 workflow 在同一个任务上的表现差异
- 让 `VerifyNode` 增加内容断言、语法检查或测试步骤

## 与 Python 原版的实现差异

- DeepSeek API 改为 LM Studio 本地模型
- `dataclass` 改为 JavaScript class
- `Workflow.run` 和节点 `run` 改为异步方法
- 文件工具使用参数对象，并增加符号链接感知的工作区边界检查

## 与上一节相比多了什么

`demo7` 教你的是“像 coding agent 一样工作”，`demo8` 教你的就是“把这套工作方式编排成可预测的流程”。

[返回首页](../README.md) | [上一节：demo7](../demo7/README.md) | [下一节：demo9](../demo9/README.md)
