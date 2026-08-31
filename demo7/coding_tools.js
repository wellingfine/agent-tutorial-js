import fsp from "node:fs/promises";
import path from "node:path";

import { tool } from "../demo6/framework/index.js";
import { resolveLikePython } from "../shared/safe_path.js";

import { WORKSPACE_DIR } from "./config.js";

/**
 * 将相对路径解析为 demo7/project_workspace 下的安全路径。
 *
 * 第七课把 coding agent 的作用范围严格限制在 project_workspace，
 * 这样既安全，也方便我们控制演示样例。
 */
export async function resolveSafePath(relativePath) {
  const cleanedPath = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!cleanedPath) {
    throw new Error("relative_path 不能为空。");
  }

  if (path.isAbsolute(cleanedPath)) {
    throw new Error("relative_path 不能是绝对路径。");
  }

  const baseDir = await resolveLikePython(WORKSPACE_DIR);
  const target = await resolveLikePython(path.join(WORKSPACE_DIR, cleanedPath));
  const relative = path.relative(baseDir, target);

  if (relative === "") {
    throw new Error("relative_path 不能指向 project_workspace 根目录本身。");
  }

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("不允许访问 project_workspace 目录之外的路径。");
  }

  return target;
}

// 解析目录路径，'.' 表示工作区根目录。
export async function resolveSafeDir(relativeDir) {
  const cleaned = String(relativeDir ?? "").trim().replace(/\/+$/, "");
  if (cleaned === "" || cleaned === ".") {
    return resolveLikePython(WORKSPACE_DIR);
  }
  return resolveSafePath(relativeDir);
}

// 递归收集目录下的所有文件（对应 Python 的 rglob("*") + is_file() 过滤）。
async function walkFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function compareLowerCase(a, b) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// 读文本；遇到疑似二进制内容（解码出 U+FFFD）返回 null，
// 对应 Python read_text 遇到非法 UTF-8 抛 UnicodeDecodeError 的分支。
async function readUtf8TextOrNull(filePath) {
  let buffer;
  try {
    buffer = await fsp.readFile(filePath);
  } catch {
    return null;
  }
  const text = buffer.toString("utf-8");
  if (text.includes("\uFFFD")) {
    return null;
  }
  return text;
}

export const listFiles = tool(
  // 列出工作区目录中的文件。
  async ({ relative_dir }) => {
    let targetDir;
    try {
      targetDir = await resolveSafeDir(relative_dir);
    } catch (error) {
      return { ok: false, error: error.message, relative_dir };
    }

    let entries;
    try {
      entries = await fsp.readdir(targetDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, error: "目录不存在。", path: targetDir };
      }
      if (error.code === "ENOTDIR") {
        return { ok: false, error: "目标路径不是目录。", path: targetDir };
      }
      return { ok: false, error: `读取目录失败：${error.message}`, path: targetDir };
    }

    const items = entries
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "dir" : "file",
      }))
      .sort((a, b) => compareLowerCase(a.name, b.name));

    return { ok: true, path: targetDir, items };
  },
  {
    name: "list_files",
    description: "List files under demo7/project_workspace. Use '.' for the workspace root.",
    parameterDescriptions: {
      relative_dir: "Relative directory under the workspace.",
    },
    parameterTypes: { relative_dir: "string" },
  }
);

export const readTextFile = tool(
  /**
   * 读取工作区中的文本文件。
   *
   * coding agent 做代码修改前，通常先要读文件。
   * 所以这是第七课里最常用的观察型工具之一。
   */
  async ({ relative_path }) => {
    let targetPath;
    try {
      targetPath = await resolveSafePath(relative_path);
    } catch (error) {
      return { ok: false, error: error.message, relative_path };
    }

    let content;
    try {
      content = await fsp.readFile(targetPath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, error: "文件不存在。", path: targetPath };
      }
      if (error.code === "EISDIR") {
        return { ok: false, error: "目标路径不是文件。", path: targetPath };
      }
      return { ok: false, error: `读取文件失败：${error.message}`, path: targetPath };
    }

    return {
      ok: true,
      path: targetPath,
      content,
      characters_read: content.length,
      context_updates: { last_read_relative_path: relative_path },
    };
  },
  {
    name: "read_text_file",
    description: "Read a text file under demo7/project_workspace.",
    parameterDescriptions: {
      relative_path: "Relative file path under the workspace.",
    },
    parameterTypes: { relative_path: "string" },
  }
);

export const searchText = tool(
  /**
   * 在工作区中搜索文本。
   *
   * 这个工具对应的是最常见的 coding agent 行为之一：
   * 先缩小范围，再去读具体文件。
   */
  async ({ query, relative_dir }) => {
    let targetDir;
    try {
      targetDir = await resolveSafeDir(relative_dir);
    } catch (error) {
      return { ok: false, error: error.message, relative_dir };
    }

    let isDir = false;
    try {
      isDir = (await fsp.stat(targetDir)).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      return { ok: false, error: "搜索目录不存在或不是目录。", path: targetDir };
    }

    const queryText = String(query ?? "");
    const baseDir = await resolveLikePython(WORKSPACE_DIR);
    const files = (await walkFiles(targetDir)).sort(compareLowerCase);
    const matches = [];

    for (const filePath of files) {
      const text = await readUtf8TextOrNull(filePath);
      if (text === null) {
        continue;
      }

      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (lines[index].includes(queryText)) {
          matches.push({
            relative_path: path.relative(baseDir, filePath).replaceAll("\\", "/"),
            line_number: index + 1,
            line: lines[index],
          });
        }
      }
    }

    return {
      ok: true,
      query: queryText,
      matches,
      match_count: matches.length,
      context_updates: { last_search_query: queryText },
    };
  },
  {
    name: "search_text",
    description: "Search text in files under demo7/project_workspace.",
    parameterDescriptions: {
      query: "Text to search for.",
      relative_dir: "Relative directory under the workspace.",
    },
    parameterTypes: { query: "string", relative_dir: "string" },
  }
);

export const searchFilesByName = tool(
  // 按文件名搜索工作区中的文件。
  async ({ name_query, relative_dir }) => {
    let targetDir;
    try {
      targetDir = await resolveSafeDir(relative_dir);
    } catch (error) {
      return { ok: false, error: error.message, relative_dir };
    }

    let isDir = false;
    try {
      isDir = (await fsp.stat(targetDir)).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      return { ok: false, error: "搜索目录不存在或不是目录。", path: targetDir };
    }

    const normalizedQuery = String(name_query ?? "").toLowerCase();
    const baseDir = await resolveLikePython(WORKSPACE_DIR);
    const files = (await walkFiles(targetDir)).sort(compareLowerCase);

    const matches = files
      .filter((filePath) => path.basename(filePath).toLowerCase().includes(normalizedQuery))
      .map((filePath) => path.relative(baseDir, filePath).replaceAll("\\", "/"));

    return {
      ok: true,
      name_query: String(name_query ?? ""),
      matches,
      match_count: matches.length,
      context_updates: { last_file_search_query: String(name_query ?? "") },
    };
  },
  {
    name: "search_files_by_name",
    description: "Search files by name under demo7/project_workspace.",
    parameterDescriptions: {
      name_query: "Filename or partial filename to search.",
      relative_dir: "Relative directory under the workspace.",
    },
    parameterTypes: { name_query: "string", relative_dir: "string" },
  }
);

export const replaceTextInFile = tool(
  /**
   * 对文件做精确字符串替换。
   *
   * 这是第七课里最重要的“修改型工具”。
   * 它要求模型给出：
   * - 要改哪个文件
   * - 旧文本是什么
   * - 新文本是什么
   * - 预期替换次数是多少
   *
   * `expected_occurrences` 的作用是做最基础的安全保护，
   * 避免模型误替换了太多地方。
   */
  async ({ relative_path, old_text, new_text, expected_occurrences }) => {
    let targetPath;
    try {
      targetPath = await resolveSafePath(relative_path);
    } catch (error) {
      return { ok: false, error: error.message, relative_path };
    }

    let original;
    try {
      original = await fsp.readFile(targetPath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ok: false, error: "文件不存在。", path: targetPath };
      }
      return { ok: false, error: `读取文件失败：${error.message}`, path: targetPath };
    }

    const oldText = String(old_text ?? "");
    const newText = String(new_text ?? "");
    const expected = Number(expected_occurrences);

    if (!oldText) {
      return { ok: false, error: "old_text 不能为空。", path: targetPath };
    }
    if (!Number.isInteger(expected) || expected < 1) {
      return {
        ok: false,
        error: "expected_occurrences 必须是大于 0 的整数。",
        path: targetPath,
      };
    }

    const occurrences = original.split(oldText).length - 1;

    if (occurrences !== expected) {
      return {
        ok: false,
        error:
          `目标文本出现次数不符合预期：expected_occurrences=${expected_occurrences}, ` +
          `actual_occurrences=${occurrences}`,
        path: targetPath,
      };
    }

    const updated = oldText === "" ? original : original.split(oldText).join(newText);
    await fsp.writeFile(targetPath, updated, "utf-8");

    return {
      ok: true,
      path: targetPath,
      replaced_occurrences: occurrences,
      context_updates: { last_modified_relative_path: relative_path },
    };
  },
  {
    name: "replace_text_in_file",
    description:
      "Replace exact text inside a file under demo7/project_workspace. " +
      "Use this for small, precise code edits after reading the file.",
    parameterDescriptions: {
      relative_path: "Relative file path under the workspace.",
      old_text: "Exact old text to replace.",
      new_text: "Exact new text to write.",
      expected_occurrences: "Expected number of occurrences for safety.",
    },
    parameterTypes: {
      relative_path: "string",
      old_text: "string",
      new_text: "string",
      expected_occurrences: "integer",
    },
  }
);

export const writeTextFile = tool(
  /**
   * 在工作区写入完整文件内容。
   *
   * 这个工具比 replace_text_in_file 更重，
   * 一般留给“需要重写完整文件”或“创建新文件”的情况。
   */
  async ({ relative_path, content, overwrite }) => {
    let targetPath;
    try {
      targetPath = await resolveSafePath(relative_path);
    } catch (error) {
      return { ok: false, error: error.message, relative_path };
    }

    await fsp.mkdir(path.dirname(targetPath), { recursive: true });

    let existedBefore = false;
    try {
      await fsp.access(targetPath);
      existedBefore = true;
    } catch {
      // 文件不存在
    }

    if (existedBefore && !overwrite) {
      return { ok: false, error: "文件已存在，且 overwrite 为 False。", path: targetPath };
    }

    const contentString = String(content ?? "");
    await fsp.writeFile(targetPath, contentString, "utf-8");

    return {
      ok: true,
      path: targetPath,
      created: !existedBefore,
      overwritten: existedBefore,
      characters_written: contentString.length,
      context_updates: { last_modified_relative_path: relative_path },
    };
  },
  {
    name: "write_text_file",
    description: "Write a complete file under demo7/project_workspace.",
    parameterDescriptions: {
      relative_path: "Relative file path under the workspace.",
      content: "Complete file content to write.",
      overwrite: "Whether to overwrite an existing file.",
    },
    parameterTypes: {
      relative_path: "string",
      content: "string",
      overwrite: "boolean",
    },
  }
);

/**
 * 注册 coding agent 使用的工具。
 *
 * 这里故意把工具分成两类：
 * - 观察型工具：list / search / read
 * - 修改型工具：replace / write
 *
 * 这样第七课在讲“coding agent 的工作流”时会更清楚：
 * 先观察，再修改。
 */
export function registerCodingTools(registry) {
  registry.registerMany(
    listFiles,
    readTextFile,
    searchText,
    searchFilesByName,
    replaceTextInFile,
    writeTextFile
  );
}
