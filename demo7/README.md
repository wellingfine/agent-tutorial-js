[返回首页](../README.md) | [上一节：demo6](../demo6/README.md) | [下一节：demo8](../demo8/README.md)

# demo7：Coding Agent Demo

这一节把前面搭好的框架用在一个更具体的场景里：代码分析与代码修改。实现复用 `demo6` 的 `ToolRegistry`、`MessageStore` 和 `AgentRuntime`。

## 本节目标

- 理解 coding agent 为什么必须强调“先观察后修改”
- 学会为代码任务设计观察型工具和修改型工具
- 理解受限工作区、安全替换和最小改动的重要性

## 入口文件

- [coding_agent_demo.js](coding_agent_demo.js)

## 关键模块

- [coding_runtime.js](coding_runtime.js)：定制 Coding Agent 的提示词和运行状态
- [coding_tools.js](coding_tools.js)：观察型与修改型代码工具
- [config.js](config.js)：工作区、会话轮数和循环上限
- [project_workspace/README.md](project_workspace/README.md)：示例工作区说明

## 运行前准备

需要 Node.js 20 或更高版本。先在 LM Studio 中加载 `qwen/qwen3.5-9b`，启动本地 OpenAI 兼容服务，然后在仓库根目录安装 `demo6` 的框架依赖：

```bash
npm install --prefix demo6
```

LM Studio 默认地址为 `http://127.0.0.1:1234`。如需覆盖，可设置：

```bash
export LMSTUDIO_BASE_URL="http://127.0.0.1:1234"
export LMSTUDIO_API_KEY="可选的 API Key"
```

## 运行方式

在仓库根目录执行：

```bash
npm --prefix demo7 start
```

也可以进入目录后运行 `node coding_agent_demo.js`。

## 本节新增能力

- 把 Agent 的工作范围限制在 `demo7/project_workspace`
- 提供“观察型工具”和“修改型工具”
- 让 Agent 先搜索，再阅读，再替换或写回
- 用 `expected_occurrences` 校验精确替换次数
- 拒绝绝对路径、路径穿越和越过工作区的符号链接

## 内置工具

观察型工具：

- `list_files`
- `search_text`
- `search_files_by_name`
- `read_text_file`

修改型工具：

- `replace_text_in_file`
- `write_text_file`

## 学习重点

典型 coding agent 工作流是：

1. 先看目录
2. 再搜文件或关键字
3. 再读具体内容
4. 最后做精确修改
5. 根据真实工具结果汇报

建议重点看：

- `coding_runtime.js`：Runtime 如何组织“先观察后修改”的行为
- `coding_tools.js`：代码工具如何限制路径并保护精确替换
- `project_workspace`：示例任务是怎么设计出来的

## 示例工作区

- [project_workspace/app.py](project_workspace/app.py)
- [project_workspace/settings.py](project_workspace/settings.py)
- [project_workspace/utils.py](project_workspace/utils.py)
- [project_workspace/README.md](project_workspace/README.md)

这里的 `.py` 文件是 Coding Agent 的示例操作对象，不是本 demo 的 Python 实现。

## 日志与安全边界

模型请求和响应默认写入 `demo6/llm_logs`，可通过 `LLM_LOG_DIR` 重定向。日志可能包含用户目标和源代码，不要提交包含敏感信息的日志。

工具只能约束文件访问范围，不会替代代码审查和测试；运行修改任务前建议备份示例工作区。

## 建议练习

- 找到 `greet_user`，给空名字增加更友好的处理
- 把 `DEFAULT_THEME` 从 `light` 改成 `dark`
- 定位某段业务逻辑并让 Agent 总结它的作用

## 与 Python 原版的实现差异

- DeepSeek API 改为 LM Studio 本地模型
- Python 装饰器工具改为 JavaScript `tool(handler, options)`
- Runtime 和工具调用改为异步实现
- 增加了符号链接感知的路径防护和失败会话回滚

## 与上一节相比多了什么

`demo6` 提供的是通用框架，`demo7` 开始把它落到“代码任务”这个具体场景里。看懂这一节，你基本就具备自己做一个小型 coding agent 原型的能力了。

[返回首页](../README.md) | [上一节：demo6](../demo6/README.md) | [下一节：demo8](../demo8/README.md)
