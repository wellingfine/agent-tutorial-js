import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

import { CHUNK_OVERLAP, CHUNK_SIZE, KNOWLEDGE_BASE_DIR } from "./config.js";

// 写入向量数据库的最小文档单元。
export class DocumentChunk {
  constructor({ chunk_id, source, chunk_index, content }) {
    this.chunk_id = chunk_id;
    this.source = source;
    this.chunk_index = chunk_index;
    this.content = content;
  }
}

/**
 * 把长文档切成多个 chunk。
 *
 * chunk 太大：检索不精准，模型上下文也浪费。
 * chunk 太小：语义容易断裂，答案缺少上下文。
 * overlap 的作用是让相邻 chunk 之间保留一点上下文衔接。
 */
export function splitText(text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end).trim());

    if (end === cleaned.length) {
      break;
    }

    start = Math.max(0, end - overlap);
  }

  return chunks.filter((chunk) => chunk);
}

// 读取 knowledge_base 目录下的 Markdown 文件并切分成 chunks。
export async function loadKnowledgeBase() {
  const chunks = [];

  let entries;
  try {
    entries = await fsp.readdir(KNOWLEDGE_BASE_DIR, { withFileTypes: true });
  } catch {
    return chunks;
  }

  const mdFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of mdFiles) {
    const text = await fsp.readFile(path.join(KNOWLEDGE_BASE_DIR, fileName), "utf-8");

    splitText(text).forEach((content, index) => {
      const digest = crypto
        .createHash("md5")
        .update(`${fileName}:${index}:${content}`)
        .digest("hex");
      chunks.push(
        new DocumentChunk({
          chunk_id: digest,
          source: fileName,
          chunk_index: index,
          content,
        })
      );
    });
  }

  return chunks;
}
