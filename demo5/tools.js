import fsp from "node:fs/promises";
import path from "node:path";

import { GENERATED_FILES_DIR } from "./config.js";
import { resolveLikePython } from "../shared/safe_path.js";

// 定义本节课可供模型自动选择的工具集合。
export function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "create_text_file",
        description:
          "Create a text file under demo5/generated_files. " +
          "Use this when the user wants to save notes, outlines, plans, markdown, or code.",
        parameters: {
          type: "object",
          properties: {
            relative_path: {
              type: "string",
              description: "Relative file path under demo5/generated_files.",
            },
            content: {
              type: "string",
              description: "Complete file content to write.",
            },
            overwrite: {
              type: "boolean",
              description: "Whether to overwrite the file if it already exists.",
            },
          },
          required: ["relative_path", "content", "overwrite"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "read_text_file",
        description:
          "Read a text file under demo5/generated_files. " +
          "Use this when the user asks to inspect, verify, or review file content.",
        parameters: {
          type: "object",
          properties: {
            relative_path: {
              type: "string",
              description: "Relative file path under demo5/generated_files.",
            },
          },
          required: ["relative_path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_files",
        description:
          "List files under demo5/generated_files. " +
          "Use this when the user asks what files exist or wants to inspect the directory.",
        parameters: {
          type: "object",
          properties: {
            relative_dir: {
              type: "string",
              description: "Relative directory under demo5/generated_files. Use '.' for the root.",
            },
          },
          required: ["relative_dir"],
        },
      },
    },
  ];
}

// 把模型给出的相对路径解析成 demo5/generated_files 里的安全路径。
async function resolveSafePath(relativePath) {
  const cleanedPath = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!cleanedPath) {
    throw new Error("relative_path 不能为空。");
  }

  if (path.isAbsolute(cleanedPath)) {
    throw new Error("relative_path 不能是绝对路径。");
  }

  const baseDir = await resolveLikePython(GENERATED_FILES_DIR);
  const target = await resolveLikePython(path.join(GENERATED_FILES_DIR, cleanedPath));
  const relative = path.relative(baseDir, target);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("不允许访问 demo5/generated_files 目录之外的路径。");
  }

  return target;
}

// 解析目录路径，'.' 表示 generated_files 根目录。
//
// 说明：Python 原版把 "." 转成空字符串传给 resolve_safe_path，
// 会因为“路径不能为空”直接报错（与工具描述“Use '.' for the root”矛盾），
// JS 版这里修正为返回根目录本身。
async function resolveSafeDir(relativeDir) {
  const cleaned = String(relativeDir ?? "").trim();
  if (cleaned === "" || cleaned === ".") {
    return resolveLikePython(GENERATED_FILES_DIR);
  }
  return resolveSafePath(relativeDir);
}

// 创建文本文件。
export async function createTextFile({ relative_path, content, overwrite }) {
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
    return {
      ok: false,
      error: "文件已存在，且 overwrite 为 False。",
      path: targetPath,
    };
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
}

// 读取文本文件。
export async function readTextFile({ relative_path }) {
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
  };
}

// 列出目录中的文件。
export async function listFiles({ relative_dir }) {
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
    .sort((a, b) => {
      const left = a.name.toLowerCase();
      const right = b.name.toLowerCase();
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });

  return {
    ok: true,
    path: targetDir,
    items,
  };
}

/**
 * 执行模型返回的单个 tool_call。
 *
 * 返回：
 * - toolName
 * - toolResult
 */
export async function executeToolCall(toolCall) {
  const functionInfo = toolCall.function || {};
  const toolName = functionInfo.name || "unknown_tool";
  const rawArguments = functionInfo.arguments ?? "{}";

  let arguments_ = {};
  try {
    arguments_ = JSON.parse(rawArguments || "{}");
  } catch (error) {
    return [
      toolName,
      {
        ok: false,
        error: `工具参数不是合法 JSON：${error.message}`,
        raw_arguments: rawArguments,
      },
    ];
  }

  if (toolName === "create_text_file") {
    const missing = ["relative_path", "content", "overwrite"].filter(
      (key) => arguments_[key] === undefined
    );
    if (missing.length > 0) {
      return [
        toolName,
        {
          ok: false,
          error: `缺少必要参数：${missing.join(", ")}`,
          arguments: arguments_,
        },
      ];
    }
    return [toolName, await createTextFile(arguments_)];
  }

  if (toolName === "read_text_file") {
    if (arguments_.relative_path === undefined) {
      return [
        toolName,
        {
          ok: false,
          error: "缺少必要参数：relative_path",
          arguments: arguments_,
        },
      ];
    }
    return [toolName, await readTextFile(arguments_)];
  }

  if (toolName === "list_files") {
    if (arguments_.relative_dir === undefined) {
      return [
        toolName,
        {
          ok: false,
          error: "缺少必要参数：relative_dir",
          arguments: arguments_,
        },
      ];
    }
    return [toolName, await listFiles(arguments_)];
  }

  return [
    toolName,
    {
      ok: false,
      error: `未知工具：${toolName}`,
      arguments: arguments_,
    },
  ];
}
