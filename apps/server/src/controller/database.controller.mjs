/**
 * @fileoverview
 * Express 后端的数据库管理控制器，负责把 HTTP 请求参数转成服务层调用并返回统一响应。
 *
 * 主要职责：
 * - 对外暴露：queryOverview、queryTableDetail、queryTableCount、queryTableData、executeSql、createRow、updateRow、deleteRows。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 从 `req.query` 或 `req.body` 读取参数并做轻量整理。
 * - 调用对应 service 模块完成业务动作。
 * - 通过统一响应格式把结果返回给前端。
 */

import { parseJsonParam } from "../lib/query.mjs";
import {
  createDatabaseRow,
  deleteDatabaseRows,
  executeDatabaseSql,
  queryDatabaseOverview,
  queryDatabaseRows,
  queryDatabaseTableCount,
  queryDatabaseTableDetail,
  updateDatabaseRow,
} from "../service/database.service.mjs";

export async function queryOverview(request, response) {
  response.apiSuccess(await queryDatabaseOverview());
}

export async function queryTableDetail(request, response) {
  response.apiSuccess(await queryDatabaseTableDetail(String(request.query.table_name || "")));
}

export async function queryTableCount(request, response) {
  response.apiSuccess(await queryDatabaseTableCount(String(request.query.table_name || "")));
}

export async function queryTableData(request, response) {
  response.apiSuccess(await queryDatabaseRows({
    table_name: String(request.query.table_name || ""),
    current_page: Number(request.query.current_page || "1"),
    page_size: Number(request.query.page_size || "20"),
    keyword: String(request.query.keyword || ""),
    search_field: String(request.query.search_field || "__all__"),
    sort_field: String(request.query.sort_field || ""),
    sort_direction: String(request.query.sort_direction || "desc"),
    filters: parseJsonParam(String(request.query.filters || ""), []),
  }));
}

export async function executeSql(request, response) {
  response.apiSuccess(await executeDatabaseSql(request.body?.sql || ""), "SQL 执行成功");
}

export async function createRow(request, response) {
  response.apiSuccess(await createDatabaseRow(request.body || {}), "新增记录成功");
}

export async function updateRow(request, response) {
  response.apiSuccess(await updateDatabaseRow(request.body || {}), "更新记录成功");
}

export async function deleteRows(request, response) {
  response.apiSuccess(await deleteDatabaseRows(request.body || {}), "删除记录成功");
}
