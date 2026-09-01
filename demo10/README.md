[返回首页](../README.md) | [上一节：demo9](../demo9/README.md) | [下一节：demo11](../demo11/README.md)

# demo10：RAG Agent Demo

这一节把 Agent 从“只依赖上下文窗口”推进到“可以查询外部知识库”的形态，核心主题是 RAG。聊天和 Embedding 都通过 LM Studio 的 OpenAI 兼容接口完成。

## 本节目标

- 理解为什么 RAG 是“先检索，再生成”
- 学会把文档切分、向量化、入库和检索串成完整链路
- 理解外部知识库为什么能降低凭空编造的概率

## 入口文件

- [rag_demo.js](rag_demo.js)

## 关键模块

- [document_loader.js](document_loader.js)：Markdown 加载与切分
- [embeddings.js](embeddings.js)：调用 LM Studio Embedding 接口
- [rag_store.js](rag_store.js)：pgvector 与内存向量存储
- [config.js](config.js)：Embedding、数据库、Chunk 和 Top-K 配置
- [knowledge_base/agent_basics.md](knowledge_base/agent_basics.md)：示例知识文档

## 运行前准备

需要 Node.js 20 或更高版本。在仓库根目录安装依赖：

```bash
npm install --prefix demo6
npm install --prefix demo10
```

在 LM Studio 中同时加载：

- Chat 模型：`qwen/qwen3.5-9b`
- Embedding 模型：`text-embedding-nomic-embed-text-v1.5`（768 维）

然后启动本地 OpenAI 兼容服务。默认地址为 `http://127.0.0.1:1234`，可通过环境变量覆盖：

```bash
export LMSTUDIO_BASE_URL="http://127.0.0.1:1234"
export LMSTUDIO_API_KEY="可选的 API Key"
```

## 向量存储模式

默认使用进程内向量存储，不需要数据库。若同时配置以下变量，则切换到 PostgreSQL pgvector：

```bash
export PGVECTOR_HOST="你的 PostgreSQL 地址"
export PGVECTOR_PASSWORD="你的数据库密码"
```

数据库端口、库名和用户名默认在 `config.js` 中配置为 `5432`、`agent_demo` 和 `ljx`。数据库必须已安装 pgvector 扩展，当前用户需有建扩展、建表和建索引权限。

`PGVECTOR_HOST` 和 `PGVECTOR_PASSWORD` 必须同时配置；只配置其中一项会直接报错，避免误回退到内存模式。密码只从环境变量读取，不要写进源码。

## 运行方式

在仓库根目录执行：

```bash
npm --prefix demo10 start
```

也可以进入目录后运行 `node rag_demo.js`。每次启动都会重新加载知识库并重建索引。

## 本节新增能力

- 加载 `knowledge_base` 中的 Markdown 文档
- 按 `CHUNK_SIZE` 和 `CHUNK_OVERLAP` 切分长文档
- 使用 LM Studio Embedding 模型生成 768 维向量
- 使用 pgvector 或内存余弦距离进行 Top-K 检索
- 把检索资料整理进 Prompt，再交给 Chat 模型回答
- 校验 Embedding 数量、维度和数值
- 用数据库事务原子重建 pgvector 索引

## 典型流程

1. `loadKnowledgeBase()` 读取知识库文档
2. `splitText()` 把文档切成适合检索的片段
3. `embedTexts()` 调用 Embedding 模型生成向量
4. `rebuildIndex()` 重建内存或 pgvector 索引
5. `retrieve()` 根据用户问题取回 Top-K 相关片段
6. `answerWithRag()` 把资料和问题一起交给 LLM 回答

## 学习重点

- Agent 不一定只能依赖 Prompt 和历史消息
- RAG 的关键链路是加载、切分、向量化、入库、检索和生成
- 查询文本和文档文本必须使用同一个 Embedding 模型与维度
- 内存模式便于教学，pgvector 模式适合持久化和更大规模数据
- 重建持久化索引应使用事务，失败时不能留下空表或半成品

## 示例知识库

- [knowledge_base/agent_basics.md](knowledge_base/agent_basics.md)
- [knowledge_base/react.md](knowledge_base/react.md)
- [knowledge_base/workflow.md](knowledge_base/workflow.md)
- [knowledge_base/hitl.md](knowledge_base/hitl.md)

## 日志与安全边界

Chat 和 Embedding 请求、响应默认写入 `demo10/llm_logs`，可通过 `LLM_LOG_DIR` 重定向。日志会包含问题、知识片段和模型响应，请勿提交含敏感资料的日志。

生产环境还应限制数据库网络来源、使用最小权限数据库账号，并为外部模型端点配置访问控制。

## 建议练习

- 新增一篇知识库文档，观察检索结果和回答是否变化
- 调整 Chunk 大小、Overlap 和 Top-K，比较召回质量
- 故意询问知识库中不存在的问题，观察系统是否说明资料不足

## 与 Python 原版的实现差异

- DeepSeek Chat 和智谱 `embedding-3` 改为 LM Studio 本地模型
- 2048 维向量改为 768 维，并使用独立表 `rag_chunks_js`
- `psycopg` 改为 `pg`，值查询继续使用参数绑定
- 新增无需 PostgreSQL 的内存向量存储模式
- 函数命名改为 JavaScript 驼峰形式并全面异步化

## 与上一节相比多了什么

如果 `demo9` 教你的是“让 Agent 在关键动作前更安全”，那么 `demo10` 教你的就是“让 Agent 在回答问题前先查资料”。

[返回首页](../README.md) | [上一节：demo9](../demo9/README.md) | [下一节：demo11](../demo11/README.md)
