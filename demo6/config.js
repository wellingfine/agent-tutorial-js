import path from "node:path";
import { fileURLToPath } from "node:url";

// 端点 / 模型 / 超时 / max_tokens 统一来自 shared/config.js（全套 JS demo 共用）。
export { API_URL, MODEL_NAME, REQUEST_TIMEOUT_MS, MAX_TOKEN } from "../shared/config.js";

// 第六课的配置保持尽量简单：
// - 不把这些常量塞回 runtime 里
// - 也不做复杂配置系统
// 这样读代码时，大家可以先把“会变化的环境参数”集中看完。

const MAX_AGENT_LOOPS = 8;
const MAX_HISTORY_TURNS = 6;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 工具可写目录：demo6/generated_files（与 Python 版保持一致）。
export const GENERATED_FILES_DIR = path.join(__dirname, "generated_files");

// LLM 请求/响应日志目录：默认 demo6/llm_logs，可用环境变量 LLM_LOG_DIR 重定向
// （重定向逻辑见 shared/llm_log.js）。
// demo6-11 复用本框架的模型调用层，LLM 日志统一写在这里。
export const LLM_LOG_DIR = path.join(__dirname, "llm_logs");

export {
  MAX_AGENT_LOOPS,
  MAX_HISTORY_TURNS,
};
