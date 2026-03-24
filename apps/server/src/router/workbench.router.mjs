/**
 * @fileoverview
 * Express 后端的工作台路由模块，负责注册该领域的 HTTP 接口和中间件链路。
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
import { queryWorkbench } from "../controller/workbench.controller.mjs";
import { asyncHandler } from "../middleware/async-handler.mjs";

const router = Router();

/**
 * @swagger
 * /api/workbench/query:
 *   get:
 *     summary: 查询工作台初始化数据
 *     tags: [Workbench]
 *     responses:
 *       200:
 *         description: 返回策略信息、默认配置、参数表单和最近回测
 */
router.get("/query", asyncHandler(queryWorkbench));

/**
 * @swagger
 * /api/workbench:
 *   get:
 *     summary: 查询工作台初始化数据（兼容别名）
 *     tags: [Workbench]
 *     responses:
 *       200:
 *         description: 与 /api/workbench/query 返回一致
 */
router.get("/", asyncHandler(queryWorkbench));

export default router;
