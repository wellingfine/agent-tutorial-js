import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const WORKSPACE_DIR = path.join(__dirname, "project_workspace");
export const MAX_WORKFLOW_STEPS = 6;
