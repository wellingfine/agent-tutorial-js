/**
 * 全套 JS demo 共用的 LM Studio 配置。
 *
 * 各 demo 自己的 config.js 只保留本节特有的参数
 * （循环次数、生成目录、日志目录等），
 * 端点、模型名、超时和鉴权统一从这里取。
 */

// LM Studio 本地服务地址；如端口不同，可通过环境变量 LMSTUDIO_BASE_URL 覆盖。
export const LMSTUDIO_BASE_URL =
  process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234";

export const API_URL = `${LMSTUDIO_BASE_URL}/v1/chat/completions`;
export const EMBEDDING_API_URL = `${LMSTUDIO_BASE_URL}/v1/embeddings`;

export const MODEL_NAME = "qwen/qwen3.5-9b";

// LM Studio 里加载的 embedding 模型（demo10 使用）。
export const EMBEDDING_MODEL = "text-embedding-nomic-embed-text-v1.5";
export const EMBEDDING_DIMENSION = 768; // nomic-embed-text-v1.5 的向量维度

// 注意是不是用思考模式，会占用更多的token，如果发现输出有截断，再调大这个值
export const MAX_TOKEN = 10*1024

// 本地推理可能比云端慢，超时给得宽松一点。
export const REQUEST_TIMEOUT_MS = 120000;

// LM Studio 默认无需鉴权；如开启了 API Key 校验，设置环境变量 LMSTUDIO_API_KEY。
export function getLlmApiKey() {
  return process.env.LMSTUDIO_API_KEY || null;
}
