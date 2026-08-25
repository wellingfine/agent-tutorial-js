import fsp from "node:fs/promises";
import path from "node:path";

import { tool } from "../demo6/framework/index.js";
import { resolveLikePython } from "../shared/safe_path.js";

/**
 * 把路径统一归一化到工作区内部。
 *
 * 兼容两种输入：
 * - 相对路径：utils.py
 * - 绝对路径：/Users/.../project_workspace/utils.py
 *
 * 如果是工作区内的绝对路径，会自动转成工作区内的绝对路径再继续处理。
 */
async function normalizeWorkspacePath(workspaceDir, candidatePath) {
  const cleanedPath = String(candidatePath ?? "").trim().replaceAll("\\", "/");
  if (!cleanedPath) {
    throw new Error("relative_path 不能为空。");
  }

  const baseDir = await resolveLikePython(workspaceDir);

  if (path.isAbsolute(cleanedPath)) {
    const resolved = await resolveLikePython(cleanedPath);
    const relative = path.relative(baseDir, resolved);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return resolved;
    }
    throw new Error("不允许访问工作区之外的路径。");
  }

  const target = await resolveLikePython(
    path.join(path.resolve(String(workspaceDir)), cleanedPath)
  );
  const relative = path.relative(baseDir, target);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return target;
  }
  throw new Error("不允许访问工作区之外的路径。");
}

/**
 * 将相对路径解析到 workspace_dir 下，并禁止跳出工作区。
 *
 * 第八课的工具仍然强调一个原则：
 * workflow 可以编排很多步骤，但每个工具的作用边界必须清晰。
 */
export async function resolveSafePath(workspaceDir, relativePath) {
  return normalizeWorkspacePath(workspaceDir, relativePath);
}

async function resolveTargetDir(workspaceDir, relativeDir) {
  const cleaned = String(relativeDir ?? "").trim().replace(/\/+$/, "");
  if (cleaned === "" || cleaned === ".") {
    return resolveLikePython(workspaceDir);
  }
  return normalizeWorkspacePath(workspaceDir, relativeDir);
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
  // 列出工作区中的文件。
  async ({ workspace_dir, relative_dir = "." }) => {
    const baseDir = await resolveLikePython(workspace_dir);
    const targetDir = await resolveTargetDir(workspace_dir, relative_dir);

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
        relative_path: path.relative(baseDir, path.join(targetDir, entry.name)).replaceAll("\\", "/"),
      }))
      .sort((a, b) => compareLowerCase(a.name, b.name));

    return { ok: true, path: targetDir, items };
  },
  {
    name: "list_files",
    description: "List files under the workspace.",
    parameterDescriptions: {
      workspace_dir: "Absolute workspace directory path.",
      relative_dir: "Relative directory under the workspace, use '.' for the root.",
    },
    parameterTypes: { workspace_dir: "string", relative_dir: "string" },
    required: ["workspace_dir"],
  }
);

export const searchText = tool(
  // 在工作区中搜索文本。
  async ({ workspace_dir, query, relative_dir = "." }) => {
    const baseDir = await resolveLikePython(workspace_dir);
    const targetDir = await resolveTargetDir(workspace_dir, relative_dir);

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
    const files = (await walkFiles(targetDir)).sort(compareLowerCase);
    const matches = [];

    for (const filePath of files) {
      const content = await readUtf8TextOrNull(filePath);
      if (content === null) {
        continue;
      }
      const lines = content.split(/\r?\n/);
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

    return { ok: true, query: queryText, match_count: matches.length, matches };
  },
  {
    name: "search_text",
    description: "Search text in files under the workspace.",
    parameterDescriptions: {
      workspace_dir: "Absolute workspace directory path.",
      query: "Text to search for.",
      relative_dir: "Relative directory under the workspace, use '.' for the root.",
    },
    parameterTypes: { workspace_dir: "string", query: "string", relative_dir: "string" },
    required: ["workspace_dir", "query"],
  }
);

export const readTextFile = tool(
  // 读取工作区中的文本文件。
  async ({ workspace_dir, relative_path }) => {
    let targetPath;
    try {
      targetPath = await normalizeWorkspacePath(workspace_dir, relative_path);
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
    };
  },
  {
    name: "read_text_file",
    description: "Read a text file under the workspace.",
    parameterDescriptions: {
      workspace_dir: "Absolute workspace directory path.",
      relative_path: "Relative file path under the workspace.",
    },
    parameterTypes: { workspace_dir: "string", relative_path: "string" },
  }
);

export const replaceTextInFile = tool(
  // 精确替换文件中的文本。
  async ({ workspace_dir, relative_path, old_text, new_text, expected_occurrences }) => {
    let targetPath;
    try {
      targetPath = await normalizeWorkspacePath(workspace_dir, relative_path);
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
    const occurrences = oldText === "" ? 0 : original.split(oldText).length - 1;

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

    return { ok: true, path: targetPath, replaced_occurrences: occurrences };
  },
  {
    name: "replace_text_in_file",
    description: "Replace exact text in a file under the workspace.",
    parameterDescriptions: {
      workspace_dir: "Absolute workspace directory path.",
      relative_path: "Relative file path under the workspace.",
      old_text: "Exact old text to replace.",
      new_text: "Exact new text to write.",
      expected_occurrences: "Expected number of occurrences for safety.",
    },
    parameterTypes: {
      workspace_dir: "string",
      relative_path: "string",
      old_text: "string",
      new_text: "string",
      expected_occurrences: "integer",
    },
  }
);

export const writeTextFile = tool(
  // 写入完整文件内容。
  async ({ workspace_dir, relative_path, content, overwrite }) => {
    let targetPath;
    try {
      targetPath = await normalizeWorkspacePath(workspace_dir, relative_path);
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
    };
  },
  {
    name: "write_text_file",
    description: "Write a complete file under the workspace.",
    parameterDescriptions: {
      workspace_dir: "Absolute workspace directory path.",
      relative_path: "Relative file path under the workspace.",
      content: "Complete file content to write.",
      overwrite: "Whether to overwrite an existing file.",
    },
    parameterTypes: {
      workspace_dir: "string",
      relative_path: "string",
      content: "string",
      overwrite: "boolean",
    },
  }
);

// 把 workflow 这组工具一次性注册进去。
export function registerWorkflowTools(registry) {
  registry.registerMany(
    listFiles,
    searchText,
    readTextFile,
    replaceTextInFile,
    writeTextFile
  );
}
