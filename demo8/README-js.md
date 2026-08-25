# demo8（JS 版）：Workflow Agent Demo

重点从“通用 runtime”切到“固定工作流编排”。复用 `../demo6` 的模型调用层（`ask_llm_json` / `ask_llm_text`）。

## 本节目标

- 理解什么场景适合用固定 workflow 而不是自由循环 Agent
- 学会把任务拆成固定节点和显式路由
- 理解验证节点在稳定任务流中的价值

## 目录结构

```
demo8/
  config.js             WORKSPACE_DIR / MAX_WORKFLOW_STEPS
  framework/            workflow 能力层（与业务无关）
    context.js          WorkflowContext / HitlContext
    node.js             BaseWorkflowNode（run + connect/route）
    workflow.js         Workflow 执行器
  example_context.js    CodeWorkflowContext（业务上下文）
  nodes.py→nodes.js     六个业务节点
  tools.js              五个带 workspace_dir 参数的文件工具
  workflow_demo.js      入口：交互式 REPL
  project_workspace/    示例 Python 项目
```

## 典型工作流

1. `ClassifyNode` 判断“总结类”还是“修改类”任务
2. `InspectNode` 查看目录、文件快照和搜索结果
3. `PlanNode` 产出精确修改计划
4. `ApplyNode` 执行修改
5. `VerifyNode` 再读文件确认变更结果
6. `ReportNode` 输出最终总结

## 运行方式

```bash
cd demo8
node workflow_demo.js   # 或 npm start
```

## 与 Python 版的差异

- dataclass → class 构造函数；`Workflow.run` / 节点 `run` 均为 async
- 节点直接 `await` 调用 `tools.js` 里的工具函数（参数对象风格）
- 工具支持把工作区内绝对路径归一化（含符号链接与路径穿越防护）
- LLM 请求/响应日志统一写入 `../demo6/llm_logs`

## 建议练习

- 在现有流程中新增一个节点，比如 `risk check`
- 对比“自由 agent”（demo7）与“固定 workflow”在同一个任务上的表现差异
