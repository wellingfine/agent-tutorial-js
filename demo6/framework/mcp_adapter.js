import { ToolDefinition } from "./agent_types.js";

// 描述一个通过 stdio 启动的 MCP Server。
//
// MCP 支持多种 transport。这里只演示最简单的 stdio 模式。
export class McpServerConfig {
  constructor({ name, command, args = [], env = null }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
  }
}

// SDK 采用懒加载：不用 MCP 时完全不需要安装这个依赖。
async function loadMcpSdk() {
  try {
    const [{ Client }, { StdioClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js"),
    ]);
    return { Client, StdioClientTransport };
  } catch {
    throw new Error(
      "使用 MCP 需要先安装 SDK：npm install @modelcontextprotocol/sdk"
    );
  }
}

async function withMcpSession(serverConfig, action) {
  const { Client, StdioClientTransport } = await loadMcpSdk();

  const transport = new StdioClientTransport({
    command: serverConfig.command,
    args: serverConfig.args,
    env: serverConfig.env ?? undefined,
  });

  const client = new Client(
    { name: "demo6-js", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  try {
    return await action(client);
  } finally {
    await client.close();
  }
}

// 把 MCP callTool 的结果转换成普通对象。
//
// ToolRegistry 约定工具返回普通对象，
// 但 MCP SDK 返回的是结构化对象，所以这里做一层格式适配。
function extractMcpResultContent(result) {
  const contentItems = result?.content || [];
  const texts = [];

  for (const item of contentItems) {
    if (typeof item?.text === "string") {
      texts.push(item.text);
    } else {
      texts.push(JSON.stringify(item));
    }
  }

  return {
    ok: !result?.isError,
    content: texts.join("\n"),
  };
}

// 连接 MCP Server 并读取它暴露的工具列表。
async function listMcpTools(serverConfig) {
  return withMcpSession(serverConfig, async (client) => {
    const result = await client.listTools();
    return [...result.tools];
  });
}

// 连接 MCP Server 并调用指定工具。
async function callMcpTool(serverConfig, toolName, arguments_) {
  return withMcpSession(serverConfig, async (client) => {
    const result = await client.callTool({ name: toolName, arguments: arguments_ });
    return extractMcpResultContent(result);
  });
}

/**
 * 把一个 MCP Server 暴露的 tools 转换成框架里的 ToolDefinition。
 *
 * - MCP Server 负责按标准协议暴露工具
 * - Agent Runtime 仍然只认识 ToolDefinition
 * - adapter 把两边接起来
 */
export async function loadMcpTools(serverConfig) {
  const mcpTools = await listMcpTools(serverConfig);
  const toolDefinitions = [];

  for (const mcpTool of mcpTools) {
    const originalName = mcpTool.name;
    const exposedName = `${serverConfig.name}_${originalName}`;

    // 与 Python 版一致：每次工具调用都重新拉起一次连接。
    const handler = (arguments_) =>
      callMcpTool(serverConfig, originalName, arguments_);

    toolDefinitions.push(
      new ToolDefinition({
        name: exposedName,
        description: `[MCP:${serverConfig.name}] ${mcpTool.description || originalName}`,
        parameters: mcpTool.inputSchema,
        handler,
      })
    );
  }

  return toolDefinitions;
}
