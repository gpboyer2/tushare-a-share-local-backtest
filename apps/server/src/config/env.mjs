/**
 * @fileoverview
 * Express 后端的环境变量配置模块，负责提供服务启动与运行时依赖的静态配置。
 *
 * 主要职责：
 * - 对外暴露：getNodeEnv、isDevelopment。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 集中声明环境变量、路径、端口、CORS 或工作台默认配置。
 * - 为 app、server 和 service 层提供统一配置来源。
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..", "..");
const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..", "..");
const NODE_ENV = process.env.NODE_ENV || "development";

const envFileCandidates = [
  path.join(SERVER_ROOT, `.env.${NODE_ENV}`),
  path.join(SERVER_ROOT, ".env"),
  path.join(PROJECT_ROOT, `.env.${NODE_ENV}`),
  path.join(PROJECT_ROOT, ".env"),
];

for (const envPath of envFileCandidates) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export function getNodeEnv() {
  return NODE_ENV;
}

export function isDevelopment() {
  return NODE_ENV === "development";
}
