/**
 * @fileoverview
 * Express 后端的Python 桥接工具模块，负责为上层业务提供可复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：detectPythonExecutable、runPythonJson。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装文件系统、Python 子进程、响应格式、请求日志或静态资源解析等细节。
 * - 被 controller、service、middleware 或 app 层复用。
 */

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { PROJECT_ROOT, SQLITE_DB_PATH } from "../config/paths.mjs";

export function detectPythonExecutable() {
  const candidates = [
    `${PROJECT_ROOT}/.venv/bin/python`,
    `${PROJECT_ROOT}/venv/bin/python`,
    "python3",
    "python",
  ];

  for (const candidate of candidates) {
    if (!candidate.includes("/") || existsSync(candidate)) {
      return candidate;
    }
  }

  return "python3";
}

export function runPythonJson(scriptPath, action, payload = {}) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = detectPythonExecutable();
    const child = spawn(
      pythonExecutable,
      [scriptPath, "--db", SQLITE_DB_PATH, "--action", action],
      {
        cwd: PROJECT_ROOT,
        env: process.env,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Python 脚本退出码 ${code}`));
        return;
      }

      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : null);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
