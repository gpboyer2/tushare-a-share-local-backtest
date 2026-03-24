/**
 * @fileoverview
 * Express 后端的路径配置模块，负责提供服务启动与运行时依赖的静态配置。
 *
 * 主要职责：
 * - 对外暴露：SERVER_ROOT、PROJECT_ROOT、OUTPUTS_DIR、TMP_DIR、WEB_DIST_DIR、DEFAULT_CONFIG_PATH、PYTHON_BRIDGE_PATH、SQLITE_DB_PATH。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 集中声明环境变量、路径、端口、CORS 或工作台默认配置。
 * - 为 app、server 和 service 层提供统一配置来源。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_ROOT = path.resolve(__dirname, "..", "..");
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..", "..");
export const OUTPUTS_DIR = path.join(PROJECT_ROOT, "outputs");
export const TMP_DIR = path.join(PROJECT_ROOT, "tmp", "web-api");
export const WEB_DIST_DIR = path.join(PROJECT_ROOT, "apps", "web", "dist");
export const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, "config", "backtest.json");
export const PYTHON_BRIDGE_PATH = path.join(PROJECT_ROOT, "scripts", "run_backtest_api.py");
export const SQLITE_DB_PATH = path.join(PROJECT_ROOT, "data_cache.db");
export const SQLITE_ADMIN_PATH = path.join(PROJECT_ROOT, "scripts", "sqlite_admin.py");
