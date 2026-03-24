/**
 * @fileoverview
 * Express 后端的数据库管理服务层，负责承接控制器请求并组织具体业务实现。
 *
 * 主要职责：
 * - 对外暴露：queryDatabaseOverview、queryDatabaseTableDetail、queryDatabaseTableCount、queryDatabaseRows、executeDatabaseSql、createDatabaseRow、updateDatabaseRow、deleteDatabaseRows。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装与 Python 脚本、文件系统、历史结果或数据库桥接相关的业务动作。
 * - 对控制器隐藏底层执行细节和错误处理约定。
 * - 输出适合 API 层消费的结构化结果。
 */

import { SQLITE_ADMIN_PATH } from "../config/paths.mjs";
import { createBadRequestError } from "../lib/http-error.mjs";
import { runPythonJson } from "../lib/python-bridge.mjs";

function requireTableName(tableName) {
  if (!tableName) {
    throw createBadRequestError("缺少 table_name 参数");
  }
}

export function queryDatabaseOverview() {
  return runPythonJson(SQLITE_ADMIN_PATH, "overview");
}

export function queryDatabaseTableDetail(tableName) {
  requireTableName(tableName);
  return runPythonJson(SQLITE_ADMIN_PATH, "table_detail", {
    table_name: tableName,
  });
}

export function queryDatabaseTableCount(tableName) {
  requireTableName(tableName);
  return runPythonJson(SQLITE_ADMIN_PATH, "table_count", {
    table_name: tableName,
  });
}

export function queryDatabaseRows(payload) {
  requireTableName(payload.table_name);
  return runPythonJson(SQLITE_ADMIN_PATH, "query_rows", payload);
}

export function executeDatabaseSql(sql) {
  return runPythonJson(SQLITE_ADMIN_PATH, "execute_sql", {
    sql: sql || "",
  });
}

export function createDatabaseRow(payload) {
  return runPythonJson(SQLITE_ADMIN_PATH, "create_row", payload);
}

export function updateDatabaseRow(payload) {
  return runPythonJson(SQLITE_ADMIN_PATH, "update_row", payload);
}

export function deleteDatabaseRows(payload) {
  return runPythonJson(SQLITE_ADMIN_PATH, "delete_rows", payload);
}
