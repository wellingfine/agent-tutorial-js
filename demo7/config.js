import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKSPACE_DIR = path.join(__dirname, "project_workspace");
export const LLM_LOG_DIR = path.join(__dirname, "llm_logs");
export const MAX_HISTORY_TURNS = 6;
export const MAX_AGENT_LOOPS = 10;
