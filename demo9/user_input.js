import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// 顺序提问用的简易封装：每次创建临时 readline，用完即关。
//
// Python 版里主循环和 ApprovalNode 都直接用 input() 读标准输入；
// JS 的 readline 接口不能被两处同时持有，所以统一走这个封装，
// 让主循环与审批节点共用同一条标准输入。
// 返回 null 表示输入流已关闭（EOF 等）。
export async function askUser(prompt) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(prompt);
  } catch {
    return null;
  } finally {
    rl.close();
  }
}
