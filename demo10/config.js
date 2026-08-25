import path from "node:path";
import { fileURLToPath } from "node:url";

// embedding 端点 / 模型 / 维度统一来自 shared/config.js（全套 JS demo 共用）。
export {
  EMBEDDING_API_URL,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSION,
} from "../shared/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BASE_DIR = __dirname;
export const KNOWLEDGE_BASE_DIR = path.join(__dirname, "knowledge_base");

// pgvector 配置（与 Python 版一致，通过环境变量提供）。
// 未配置 PGVECTOR_HOST / PGVECTOR_PASSWORD 时，自动退回内存向量存储。
export const PGVECTOR_PORT = 5432;
export const PGVECTOR_DATABASE = "agent_demo";
export const PGVECTOR_USER = "ljx";
export const PGVECTOR_HOST = process.env.PGVECTOR_HOST || null; // 公网访问地址
export const PGVECTOR_PASSWORD = process.env.PGVECTOR_PASSWORD || null; // 用户密码

// JS 版默认使用独立的表名，避免和 Python 版 2048 维的 rag_chunks 表冲突。
export const TABLE_NAME = "rag_chunks_js";
export const TOP_K = 4;
export const CHUNK_SIZE = 700;
export const CHUNK_OVERLAP = 120;
