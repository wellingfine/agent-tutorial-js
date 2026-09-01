import { getApiKey } from "./llm.js";
import { loadMcpTools } from "./mcp_adapter.js";
import { MessageStore } from "./message_store.js";
import { AgentRuntime } from "./runtime.js";
import { ToolRegistry } from "./tool_registry.js";

// 创建一个可直接使用的 runtime 和 message store。
//
// 因为 MCP 工具加载涉及子进程与网络握手，这里是 async 的。
export async function createRuntime({
  apiKey = getApiKey(),
  tools = [],
  toolModules = [],
  mcpServers = [],
  maxLoops = 8,
  maxTurns = 6,
  systemMessage = null,
  logDir = null,
} = {}) {
  const registry = new ToolRegistry();

  for (const tool of tools) {
    registry.register(tool);
  }

  for (const toolModule of toolModules) {
    registry.registerToolsFromModule(toolModule);
  }

  for (const serverConfig of mcpServers) {
    for (const mcpTool of await loadMcpTools(serverConfig)) {
      registry.register(mcpTool);
    }
  }

  const runtime = new AgentRuntime({
    apiKey,
    toolRegistry: registry,
    maxLoops,
    systemMessage,
    logDir,
  });

  const messageStore = new MessageStore({ maxTurns });
  return [runtime, messageStore];
}
