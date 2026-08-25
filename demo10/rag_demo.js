import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { askLlmText, getApiKey } from "../demo6/framework/index.js";

import { EMBEDDING_MODEL } from "./config.js";
import { rebuildIndex, retrieve, usingPgvector } from "./rag_store.js";

// 把检索结果整理成适合塞进 prompt 的上下文文本。
function buildContextText(chunks) {
  if (!chunks || chunks.length === 0) {
    return "没有检索到相关资料。";
  }

  const parts = [];
  chunks.forEach((chunk, index) => {
    parts.push(
      [
        `[资料 ${index + 1}]`,
        `来源：${chunk.source}，chunk_index=${chunk.chunk_index}，distance=${chunk.distance.toFixed(4)}`,
        chunk.content,
      ].join("\n")
    );
  });

  return parts.join("\n\n");
}

// 先检索，再把检索结果交给大模型生成答案。
async function answerWithRag(question) {
  const chunks = await retrieve(question);
  const contextText = buildContextText(chunks);

  const systemPrompt =
    "你是一个 RAG 教程助手。" +
    "回答问题时必须优先依据提供的资料。" +
    "如果资料里没有答案，要明确说资料不足，不要编造。" +
    "回答使用简洁清晰的中文。";
  const userContent = `用户问题：${question}\n\n可参考资料：\n${contextText}`;

  return askLlmText(systemPrompt, userContent);
}

async function main() {
  const storeMode = usingPgvector() ? "PostgreSQL pgvector" : "内存向量存储";
  console.log(`RAG Demo（JS 版）已启动。正在使用 LM Studio ${EMBEDDING_MODEL} + ${storeMode} 构建索引...`);

  // 提前做一次启动检查（LM Studio 无需 key，这里保持与 Python 版一致的节奏）。
  getApiKey();

  let result;
  try {
    result = await rebuildIndex();
  } catch (error) {
    console.error(`索引构建失败：${error?.message || error}`);
    return;
  }

  console.log(`索引构建完成：documents=${result.documents}，chunks=${result.chunks}`);
  console.log("输入 exit 或 quit 结束。");
  console.log("你可以试试：ReAct Agent 和普通聊天机器人有什么区别？");

  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    let question;
    try {
      question = await rl.question("\n你：");
    } catch {
      break;
    }

    if (question === null || question === undefined) {
      break;
    }

    question = question.trim();

    if (["exit", "quit"].includes(question.toLowerCase())) {
      console.log("已结束。");
      break;
    }

    if (!question) {
      continue;
    }

    try {
      const answer = await answerWithRag(question);
      console.log(`\n助手：${answer}`);
    } catch (error) {
      console.error(`回答失败：${error?.message || error}`);
    }
  }

  rl.close();
}

main().catch((error) => {
  console.error(`启动失败：${error?.message || error}`);
  process.exitCode = 1;
});
