# demo10（JS 版）：RAG Agent Demo

把 Agent 从“只依赖上下文窗口”推进到“可以查询外部知识库”。复用 `../demo6` 的模型调用层；embedding 改用 **LM Studio**（`text-embedding-nomic-embed-text-v1.5`，768 维），对应 Python 版的智谱 `embedding-3`。

## 本节目标

- 理解为什么 RAG 是“先检索，再生成”
- 学会把文档切分、向量化、入库和检索串成一条完整链路
- 理解外部知识库为什么能显著降低“凭空编造”的概率

## 目录结构

```
demo10/
  config.js           embedding / pgvector / chunk 参数
  document_loader.js  Markdown 加载 + 按 CHUNK_SIZE/OVERLAP 切分
  embeddings.js       LM Studio /v1/embeddings（与 chat 共用日志约定）
  rag_store.js        向量存储：pgvector 模式 + 内存模式
  rag_demo.js         入口：建索引 + 问答 REPL
  knowledge_base/     四篇示例文档
```

## 双模式向量存储

| 模式 | 触发条件 | 说明 |
| --- | --- | --- |
| pgvector | 配置了 `PGVECTOR_HOST` + `PGVECTOR_PASSWORD` | 与 Python 版一致：建表、hnsw 索引、`<=>` 余弦距离检索；依赖 `pg`（已安装），使用独立表 `rag_chunks_js`，避免和 Python 版 2048 维的 `rag_chunks` 冲突 |
| 内存 | 未配置上述环境变量 | 进程内余弦相似度检索，零外部依赖即可跑通教学链路 |

```bash
export PGVECTOR_HOST="你的 PostgreSQL 地址"
export PGVECTOR_PASSWORD="你的数据库密码"
```

## 运行方式

```bash
cd demo10
node rag_demo.js   # 或 npm start
```

典型流程：`load_knowledge_base` → `split_text` → `embed_texts`（LM Studio）→ `rebuild_index` → `retrieve`（Top-K）→ `answer_with_rag`。

## 与 Python 版的差异

- 智谱 `embedding-3`（2048 维）→ LM Studio `text-embedding-nomic-embed-text-v1.5`（768 维）
- psycopg → `pg`（参数化查询，标识符做白名单校验）
- 新增内存向量存储作为无数据库环境的替代
- chat 与 embedding 调用的 req/resp 日志统一写入 `../demo6/llm_logs`

## 建议练习

- 新增一篇知识库文档，观察检索结果和回答是否变化
- 调整 chunk 大小、overlap、Top-K，比较召回质量变化
- 故意问一个知识库里没有的问题，观察系统是否会明确说明资料不足
