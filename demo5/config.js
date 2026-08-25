import path from "node:path";
import { fileURLToPath } from "node:url";

// 端点 / 模型 / 超时 / max_tokens 统一来自 shared/config.js（全套 JS demo 共用）。
export { API_URL, MODEL_NAME, REQUEST_TIMEOUT_MS, MAX_TOKEN } from "../shared/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_HISTORY_TURNS = 6;
const MAX_AGENT_LOOPS = 8;

// 所有由工具创建的文件都限制在这个目录里。
export const GENERATED_FILES_DIR = path.join(__dirname, "generated_files");

// 本 demo 的 LLM 请求/响应日志目录（重定向见 shared/llm_log.js）。
export const LLM_LOG_DIR = path.join(__dirname, "llm_logs");

export {
  MAX_HISTORY_TURNS,
  MAX_AGENT_LOOPS,
};
