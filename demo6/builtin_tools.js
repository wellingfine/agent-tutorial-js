import fsp from "node:fs/promises";
import path from "node:path";

import { GENERATED_FILES_DIR } from "./config.js";
import { tool } from "./framework/index.js";
import { resolveLikePython } from "../shared/safe_path.js";

/**
 * 将相对路径解析为 demo6/generated_files 里的安全路径。
 *
 * 这里统一把工具的写入范围限制在 demo6/generated_files，
 * 这样示例更安全，也更容易讲清楚“工具权限边界”。
 */
export async function resolveSafePath(relativePath) {
  const cleanedPath = String(relativePath ?? "").trim().replaceAll("\\", "/");
  if (!cleanedPath) {
    throw new Error("relative_path 不能为空。");
  }

  if (path.isAbsolute(cleanedPath)) {
    throw new Error("relative_path 不能是绝对路径。");
  }

  const baseDir = await resolveLikePython(GENERATED_FILES_DIR);
  const target = await resolveLikePython(
    path.join(GENERATED_FILES_DIR, cleanedPath)
  );
  const relative = path.relative(baseDir, target);

  if (relative === "") {
    throw new Error("relative_path 不能指向 generated_files 根目录本身。");
  }

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("不允许访问 demo6/generated_files 目录之外的路径。");
  }

  return target;
}

// 解析目录路径，'.' 表示生成文件根目录。
export async function resolveSafeDir(relativeDir) {
  const cleaned = String(relativeDir ?? "").trim().replace(/\/+$/, "");
  if (cleaned === "" || cleaned === ".") {
    return resolveLikePython(GENERATED_FILES_DIR);
  }
  return resolveSafePath(relativeDir);
}

export const createTextFile = tool(
  /**
   * 创建文本文件。
   *
   * 这个工具除了返回成功与否，还会返回 context_updates。
   * runtime 看到这些字段后，会自动把它们写进 shared_context。
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
      context_updates: {
        last_created_relative_path: relative_path,
      },
    };
  },
  {
    name: "create_text_file",
    description:
      "Create a text file under demo6/generated_files. " +
      "Use this when the user wants to save notes, outlines, plans, markdown, or code.",
    parameterDescriptions: {
      relative_path:
        "Relative file path under demo6/generated_files, such as notes/plan.md.",
      content: "Complete file content to write.",
      overwrite: "Whether to overwrite the file if it already exists.",
    },
    parameterTypes: {
      relative_path: "string",
      content: "string",
      overwrite: "boolean",
    },
  }
);

export const readTextFile = tool(
  /**
   * 读取文本文件。
   *
   * 这个工具会把最近读取的相对路径回写给 runtime，
   * 方便模型在后续步骤里继续引用。
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
      context_updates: {
        last_read_relative_path: relative_path,
      },
    };
  },
  {
    name: "read_text_file",
    description:
      "Read a text file under demo6/generated_files. " +
      "Use this when the user asks to inspect, verify, or review file content.",
    parameterDescriptions: {
      relative_path: "Relative file path under demo6/generated_files.",
    },
    parameterTypes: {
      relative_path: "string",
    },
  }
);

export const listFiles = tool(
  // 列出目录中的文件。
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
  },
  {
    name: "list_files",
    description:
      "List files under demo6/generated_files. " +
      "Use this when the user asks what files exist or wants to inspect the directory.",
    parameterDescriptions: {
      relative_dir:
        "Relative directory under demo6/generated_files. Use '.' for the root.",
    },
    parameterTypes: {
      relative_dir: "string",
    },
  }
);

/**
 * 注册第六课示例中用到的内置文件工具。
 *
 * 这里使用 registerMany(...)，
 * 表达的是“这一组工具一起构成了 demo6 的默认工具集”。
 */
export function registerBuiltinFileTools(registry) {
  registry.registerMany(createTextFile, readTextFile, listFiles);
}
