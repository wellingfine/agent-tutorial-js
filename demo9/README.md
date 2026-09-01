[返回首页](../README.md) | [上一节：demo8](../demo8/README.md) | [下一节：demo10](../demo10/README.md)

# demo9：HITL Workflow Demo

这一节在 `demo8` 的 workflow 基础上继续推进，核心主题是 Human-in-the-Loop（HITL）：模型可以提出修改计划，但真正写文件前必须由人确认。

## 本节目标

- 理解什么情况下需要在 Agent 流程中加入人工确认
- 学会把“修改计划”和“真正落盘”拆成两个阶段
- 理解可用 Agent 系统为什么很多时候不是更自动，而是更可控

## 入口文件

- [hitl_demo.js](hitl_demo.js)

## 关键模块

- [hitl_context.js](hitl_context.js)：带审批状态的业务上下文
- [nodes.js](nodes.js)：审批、安全执行和报告节点
- [user_input.js](user_input.js)：主循环与审批共用的输入封装
- [../demo8/framework/context.js](../demo8/framework/context.js)：通用工作流上下文
- [project_workspace/README.md](project_workspace/README.md)：示例工作区说明

## 运行前准备

需要 Node.js 20 或更高版本。先在 LM Studio 中加载 `qwen/qwen3.5-9b` 并启动本地服务，再在仓库根目录执行：

```bash
npm install --prefix demo6
```

默认服务地址为 `http://127.0.0.1:1234`。可用 `LMSTUDIO_BASE_URL` 和可选的 `LMSTUDIO_API_KEY` 覆盖连接配置。

## 运行方式

在仓库根目录执行：

```bash
npm --prefix demo9 start
```

也可以进入目录后运行 `node hitl_demo.js`。本示例需要交互式终端来完成审批。

## 本节新增能力

- 在 workflow 中插入人工确认节点
- 把 `plan -> approval -> apply` 变成强约束流程
- 在写文件前展示目标文件、修改理由和修改内容
- 只有明确输入 `yes` 或 `y` 才允许写入
- 人工拒绝后终止修改路径并生成报告
- 复用 `demo8` 的上下文、节点和文件工具

## 关键链路

1. `ClassifyNode` 和 `InspectNode` 先分类并观察工作区
2. `PlanNode` 生成修改计划
3. `ApprovalNode` 展示目标文件、理由、旧内容和新内容
4. 人工批准后，`SafeApplyNode` 再次检查审批状态并执行写入
5. `VerifyNode` 重新读取目标文件
6. 人工拒绝时直接进入 `HitlReportNode`，不写入文件

## 学习重点

和 `demo8` 相比，这一节更强调：

- 不是所有任务都应该自动落盘
- 当任务存在风险时，Agent 需要把执行权交还给人
- 审批节点和执行节点都应检查授权，不能只依赖界面流程
- 审批内容必须覆盖精确替换、删除和整文件写入

## 示例工作区

- [project_workspace/app.py](project_workspace/app.py)
- [project_workspace/settings.py](project_workspace/settings.py)
- [project_workspace/utils.py](project_workspace/utils.py)
- [project_workspace/README.md](project_workspace/README.md)

这里的 `.py` 文件是 HITL 工作流的示例操作对象，不是本 demo 的 Python 实现。

## 日志与安全边界

审批预览会截断过长文本并明确标记省略；执行前请结合目标文件自行复核。`before_snapshot` 只保存在当前进程内，用于审计展示，不是持久化备份或自动回滚机制。

模型请求和响应默认写入 `demo9/llm_logs`，可通过 `LLM_LOG_DIR` 重定向。日志可能包含修改计划和源代码，请勿提交敏感日志。

## 建议练习

- 给审批节点增加“提供修改意见后重新规划”的分支
- 给执行节点增加持久化备份和失败回滚
- 思考哪些任务必须经过人工确认，哪些任务可以自动执行

## 与 Python 原版的实现差异

- DeepSeek API 改为 LM Studio 本地模型
- 主循环和审批节点统一通过异步 `askUser` 顺序读取标准输入
- Python 多继承改为继承 `CodeWorkflowContext` 后平铺审批字段
- 增加 EOF 退出处理和更严格的修改计划校验

## 与上一节相比多了什么

如果 `demo8` 教你的是“如何让流程更稳定”，那么 `demo9` 教你的就是“如何让流程更安全”。

[返回首页](../README.md) | [上一节：demo8](../demo8/README.md) | [下一节：demo10](../demo10/README.md)
