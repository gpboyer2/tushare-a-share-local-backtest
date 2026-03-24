/**
 * @fileoverview
 * Express 后端的类型检查业务模块。
 *
 * 主要职责：
 * - 对外暴露：collectMjsFiles。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 为对应目录层级提供单一职责能力。
 * - 通过导出函数或常量参与后端主链路运行。
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SRC_ROOT = path.resolve(process.cwd(), "src");

async function collectMjsFiles(targetDir) {
  const entries = await readdir(targetDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMjsFiles(nextPath)));
      continue;
    }
    if (entry.isFile() && nextPath.endsWith(".mjs")) {
      files.push(nextPath);
    }
  }

  return files;
}

const files = await collectMjsFiles(SRC_ROOT);

for (const filePath of files) {
  await execFileAsync("node", ["--check", filePath], {
    cwd: process.cwd(),
  });
}
