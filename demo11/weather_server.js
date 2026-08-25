#!/usr/bin/env node
// 对应 Python 版的 weather_server.py：用 MCP SDK 暴露天气工具。
//
// 注意：stdio transport 用 stdout 传 JSON-RPC 消息，
// 所以这个文件里绝对不能往 stdout 打印任何日志。

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const WEATHER_DATA = {
  北京: {
    weather: "晴",
    temperature: "28°C",
    wind: "东北风 2 级",
    suggestion: "适合外出，但中午注意防晒。",
  },
  上海: {
    weather: "多云",
    temperature: "26°C",
    wind: "东南风 3 级",
    suggestion: "体感舒适，适合通勤和散步。",
  },
  杭州: {
    weather: "小雨",
    temperature: "24°C",
    wind: "西南风 2 级",
    suggestion: "建议带伞，路面湿滑注意安全。",
  },
  深圳: {
    weather: "雷阵雨",
    temperature: "30°C",
    wind: "南风 3 级",
    suggestion: "注意短时强降雨，尽量避开户外长时间停留。",
  },
};

const server = new McpServer({ name: "weather-server", version: "1.0.0" });

server.registerTool(
  "query_weather",
  {
    description: "查询指定城市的天气。",
    inputSchema: { city: z.string() },
  },
  async ({ city }) => {
    const cleaned = String(city ?? "").trim();
    const data = WEATHER_DATA[cleaned];

    if (!data) {
      const availableCities = Object.keys(WEATHER_DATA).join("、");
      return {
        content: [
          {
            type: "text",
            text: `暂时没有 ${cleaned} 的天气数据。当前支持的城市：${availableCities}。`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text:
            `${cleaned}天气：${data.weather}，` +
            `气温：${data.temperature}，` +
            `风力：${data.wind}。` +
            `建议：${data.suggestion}`,
        },
      ],
    };
  }
);

server.registerTool(
  "list_supported_cities",
  {
    description: "列出当前天气 MCP Server 支持查询的城市。",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: "当前支持查询的城市：" + Object.keys(WEATHER_DATA).join("、"),
      },
    ],
  })
);

await server.connect(new StdioServerTransport());
