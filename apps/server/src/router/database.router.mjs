/**
 * @fileoverview
 * Express 后端的数据库管理路由模块，负责注册该领域的 HTTP 接口和中间件链路。
 *
 * 主要职责：
 * - 对外暴露：模块级常量、类型或默认导出。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 定义接口路径、HTTP 方法和控制器绑定关系。
 * - 按模块把系统、工作台、回测、数据库等路由聚合到应用中。
 */

import { Router } from "express";
import {
  createRow,
  deleteRows,
  executeSql,
  queryOverview,
  queryTableCount,
  queryTableData,
  queryTableDetail,
  updateRow,
} from "../controller/database.controller.mjs";
import { asyncHandler } from "../middleware/async-handler.mjs";

const router = Router();

/**
 * @swagger
 * /api/database/query:
 *   get:
 *     summary: 查询数据库概览
 *     tags: [Database]
 *     responses:
 *       200:
 *         description: 返回数据库路径、大小、版本和表摘要
 */
router.get("/query", asyncHandler(queryOverview));

/**
 * @swagger
 * /api/database/table/query:
 *   get:
 *     summary: 查询表结构详情
 *     tags: [Database]
 *     parameters:
 *       - in: query
 *         name: table_name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 返回表结构和索引信息
 */
router.get("/table/query", asyncHandler(queryTableDetail));

/**
 * @swagger
 * /api/database/table/count/query:
 *   get:
 *     summary: 查询单表行数
 *     tags: [Database]
 *     parameters:
 *       - in: query
 *         name: table_name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 返回单表记录数
 */
router.get("/table/count/query", asyncHandler(queryTableCount));

/**
 * @swagger
 * /api/database/data/query:
 *   get:
 *     summary: 查询表数据
 *     tags: [Database]
 *     parameters:
 *       - in: query
 *         name: table_name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 返回表数据分页结果
 */
router.get("/data/query", asyncHandler(queryTableData));

/**
 * @swagger
 * /api/database/sql/query:
 *   post:
 *     summary: 执行受限 SQL
 *     tags: [Database]
 *     responses:
 *       200:
 *         description: 返回 SQL 执行结果
 */
router.post("/sql/query", asyncHandler(executeSql));

/**
 * @swagger
 * /api/database/row/create:
 *   post:
 *     summary: 新增单行记录
 *     tags: [Database]
 *     responses:
 *       200:
 *         description: 返回写入结果
 */
router.post("/row/create", asyncHandler(createRow));

/**
 * @swagger
 * /api/database/row/update:
 *   post:
 *     summary: 更新单行记录
 *     tags: [Database]
 *     responses:
 *       200:
 *         description: 返回更新结果
 */
router.post("/row/update", asyncHandler(updateRow));

/**
 * @swagger
 * /api/database/row/delete:
 *   post:
 *     summary: 删除记录
 *     tags: [Database]
 *     responses:
 *       200:
 *         description: 返回删除结果
 */
router.post("/row/delete", asyncHandler(deleteRows));

export default router;
