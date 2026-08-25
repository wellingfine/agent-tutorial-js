# demo9（JS 版）：HITL Workflow Demo

在 `demo8` 的 workflow 基础上加入 Human-in-the-Loop：`plan -> approval -> apply` 强约束流程。复用 `../demo6`（模型调用）与 `../demo8`（workflow 框架、节点、工具）。

## 本节目标

- 理解什么情况下需要在 Agent 流程中加入人工确认
- 学会把“修改计划”和“真正落盘”拆成两个阶段
- 理解可用 Agent 系统为什么很多时候不是更自动，而是更可控

## 目录结构

```
demo9/
  config.js           WORKSPACE_DIR / MAX_WORKFLOW_STEPS（比 demo8 多一步）
  user_input.js       askUser：主循环与审批节点共用的顺序提问封装
  hitl_context.js     HitlWorkflowContext（Python 多继承 → 单继承 + 字段平铺）
  nodes.js            ApprovalNode / SafeApplyNode / HitlReportNode
                       （并从 ../demo8/nodes.js 复用 Classify/Inspect/Plan/Verify）
  hitl_demo.js        入口：交互式 REPL
  project_workspace/  示例 Python 项目
```

## 关键链路

1. 模型先生成修改计划
2. `ApprovalNode` 把目标文件、修改理由、旧内容、新内容展示出来，等待人工输入
3. 只有人明确输入 `yes`，workflow 才会进入真正的写入节点
4. 如果人拒绝，直接进入报告节点，不写入任何文件

## 运行方式

```bash
cd demo9
node hitl_demo.js   # 或 npm start
```

## 与 Python 版的差异

- Python 里主循环和 `ApprovalNode` 都直接用 `input()` 读标准输入；
  JS 的 readline 接口不能被两处同时持有，所以统一走 `user_input.js` 的 `askUser`
- `HitlWorkflowContext` 在 Python 里是 `HitlContext + CodeWorkflowContext` 多继承，
  JS 改为继承 `CodeWorkflowContext` 后平铺确认相关字段
- LLM 请求/响应日志统一写入 `../demo6/llm_logs`

## 建议练习

- 给审批节点增加“修改意见后重试”的分支
- 思考哪些任务必须经过人确认，哪些任务可以自动执行
