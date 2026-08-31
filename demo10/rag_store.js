import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  PGVECTOR_DATABASE,
  PGVECTOR_HOST,
  PGVECTOR_PASSWORD,
  PGVECTOR_PORT,
  PGVECTOR_USER,
  TABLE_NAME,
  TOP_K,
} from "./config.js";
import { loadKnowledgeBase } from "./document_loader.js";
import { embedQuery, embedTexts } from "./embeddings.js";

// 从向量库检索回来的上下文片段。
export class RetrievedChunk {
  constructor({ source, chunk_index, content, distance }) {
    this.source = source;
    this.chunk_index = chunk_index;
    this.content = content;
    this.distance = distance;
  }
}

// 配置了 PGVECTOR_HOST / PGVECTOR_PASSWORD 时走 pgvector，
// 否则退回进程内内存向量存储，保证 demo 零外部依赖即可跑通。
export function usingPgvector() {
  const hasHost = Boolean(PGVECTOR_HOST);
  const hasPassword = Boolean(PGVECTOR_PASSWORD);
  if (hasHost !== hasPassword) {
    throw new Error("PGVECTOR_HOST 和 PGVECTOR_PASSWORD 必须同时配置，否则请都不配置以使用内存模式。");
  }
  return hasHost;
}

// ---------- pgvector 模式（对应 Python 版 psycopg + pgvector） ----------

async function loadPg() {
  try {
    const module = await import("pg");
    return module.default;
  } catch {
    throw new Error("使用 pgvector 模式需要先安装 pg：npm install pg");
  }
}

// 表名来自本仓库配置常量，不是用户输入；这里再做一次白名单校验，
// 防止有人改配置时不小心引入非法标识符。
function assertTableName() {
  if (!/^[A-Za-z0-9_]+$/.test(TABLE_NAME)) {
    throw new Error(`TABLE_NAME 含有不安全字符：${TABLE_NAME}`);
  }
}

async function withPgClient(action) {
  const pg = await loadPg();
  const client = new pg.Client({
    host: PGVECTOR_HOST,
    port: PGVECTOR_PORT,
    database: PGVECTOR_DATABASE,
    user: PGVECTOR_USER,
    password: PGVECTOR_PASSWORD,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

// 把数组转成 pgvector 可识别的文本格式：[0.1,0.2,0.3]
// 这里不拼 SQL 结构，只把它作为参数传给 pg，再在 SQL 里显式转换为 vector。
function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding 维度不匹配，预期 ${EMBEDDING_DIMENSION} 维。`);
  }
  const values = embedding.map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding 包含非有限数值。");
  }
  return `[${values.join(",")}]`;
}

// 初始化 pgvector 扩展和数据表。
// 注意：CREATE EXTENSION vector 需要数据库已经安装 pgvector 扩展。
async function setupDatabase() {
  assertTableName();
  const dimension = Number(EMBEDDING_DIMENSION);
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error(`EMBEDDING_DIMENSION 不合法：${EMBEDDING_DIMENSION}`);
  }

  await withPgClient(async (client) => {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${dimension}) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`
    );
  });

  // 向量索引是性能优化，不是 RAG 流程成立的前提。
  // 部分云数据库 pgvector 版本可能不支持 hnsw，因此这里失败只提示，不中断 demo。
  try {
    await withPgClient(async (client) => {
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${TABLE_NAME}_embedding_hnsw_idx
         ON ${TABLE_NAME} USING hnsw (embedding vector_cosine_ops)`
      );
    });
  } catch (error) {
    console.log(`提示：向量索引创建失败，将使用顺序扫描完成 demo。原因：${error.message}`);
  }
}

async function rebuildIndexPg() {
  console.log("[1/5] 初始化 pgvector 数据表...");
  await setupDatabase();

  console.log("[2/5] 读取并切分 knowledge_base 文档...");
  const chunks = await loadKnowledgeBase();
  if (chunks.length === 0) {
    throw new Error("knowledge_base 目录下没有可索引的 Markdown 文档。");
  }

  console.log(`[3/5] 调用 LM Studio ${EMBEDDING_MODEL}：chunks=${chunks.length}...`);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  console.log("[4/5] 清空旧索引...");
  console.log("[5/5] 写入 pgvector...");
  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`TRUNCATE TABLE ${TABLE_NAME}`);
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        await client.query(
          `INSERT INTO ${TABLE_NAME} (id, source, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)
           ON CONFLICT (id) DO UPDATE SET
             source = EXCLUDED.source,
             chunk_index = EXCLUDED.chunk_index,
             content = EXCLUDED.content,
             embedding = EXCLUDED.embedding`,
          [
            chunk.chunk_id,
            chunk.source,
            chunk.chunk_index,
            chunk.content,
            vectorLiteral(embeddings[index]),
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return {
    documents: new Set(chunks.map((chunk) => chunk.source)).size,
    chunks: chunks.length,
  };
}

async function retrievePg(query, topK) {
  const queryEmbedding = await embedQuery(query);
  const literal = vectorLiteral(queryEmbedding);

  return withPgClient(async (client) => {
    const result = await client.query(
      `SELECT
          source,
          chunk_index,
          content,
          embedding <=> $1::vector AS distance
        FROM ${TABLE_NAME}
        ORDER BY embedding <=> $2::vector
        LIMIT $3`,
      [literal, literal, topK]
    );

    return result.rows.map(
      (row) =>
        new RetrievedChunk({
          source: row.source,
          chunk_index: row.chunk_index,
          content: row.content,
          distance: Number(row.distance),
        })
    );
  });
}

// ---------- 内存模式（未配置 PostgreSQL 时的零依赖替代） ----------

const memoryChunks = []; // { chunk, embedding }

function cosineDistance(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) {
    return 1;
  }
  return 1 - dot / Math.sqrt(normA * normB);
}

async function rebuildIndexMemory() {
  console.log("[1/5] 未配置 PGVECTOR_HOST / PGVECTOR_PASSWORD，本次使用内存向量存储...");
  console.log("[2/5] 读取并切分 knowledge_base 文档...");
  const chunks = await loadKnowledgeBase();
  if (chunks.length === 0) {
    throw new Error("knowledge_base 目录下没有可索引的 Markdown 文档。");
  }

  console.log(`[3/5] 调用 LM Studio ${EMBEDDING_MODEL}：chunks=${chunks.length}...`);
  const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));

  console.log("[4/5] 清空旧索引...");
  memoryChunks.length = 0;

  console.log("[5/5] 写入内存向量存储...");
  chunks.forEach((chunk, index) => {
    memoryChunks.push({ chunk, embedding: embeddings[index] });
  });

  return {
    documents: new Set(chunks.map((chunk) => chunk.source)).size,
    chunks: chunks.length,
  };
}

async function retrieveMemory(query, topK) {
  const queryEmbedding = await embedQuery(query);
  return memoryChunks
    .map(
      ({ chunk, embedding }) =>
        new RetrievedChunk({
          source: chunk.source,
          chunk_index: chunk.chunk_index,
          content: chunk.content,
          distance: cosineDistance(queryEmbedding, embedding),
        })
    )
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topK);
}

// ---------- 统一入口 ----------

/**
 * 重建 RAG 索引。
 *
 * 教学 demo 为了让流程清晰，每次启动都清空并重新写入知识库。
 * 真实项目一般会做增量更新，而不是每次重建。
 */
export async function rebuildIndex() {
  if (usingPgvector()) {
    return rebuildIndexPg();
  }
  return rebuildIndexMemory();
}

// 把用户问题转成向量，然后做相似度检索。
export async function retrieve(query, topK = TOP_K) {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("topK 必须是大于 0 的整数。");
  }
  if (usingPgvector()) {
    return retrievePg(query, topK);
  }
  return retrieveMemory(query, topK);
}
