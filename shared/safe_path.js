import fsp from "node:fs/promises";
import path from "node:path";

// 全套 demo 共用的安全路径工具。

export async function realpathOrNull(target) {
  try {
    return await fsp.realpath(target);
  } catch {
    return null;
  }
}

/**
 * 模拟 Python Path.resolve(strict=False)：
 * 尽量解析已存在路径上的符号链接，不存在的尾部保持词法拼接。
 *
 * 供各 demo 的 resolveSafePath / resolveSafeDir
 * 做符号链接感知的目录越界检查。
 */
export async function resolveLikePython(target) {
  const absolute = path.resolve(target);
  let probe = absolute;
  const tail = [];

  for (;;) {
    const real = await realpathOrNull(probe);
    if (real !== null) {
      return tail.length > 0 ? path.join(real, ...tail) : real;
    }
    tail.unshift(path.basename(probe));
    const parent = path.dirname(probe);
    if (parent === probe) {
      return absolute;
    }
    probe = parent;
  }
}
