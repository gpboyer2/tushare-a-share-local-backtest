/**
 * @fileoverview
 * Express 后端的系统健康检查路由模块，负责注册该领域的 HTTP 接口和中间件链路。
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
import { queryHealth } from "../controller/system.controller.mjs";

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: 健康检查
 *     tags: [System]
 *     responses:
 *       200:
 *         description: 返回服务状态、Python 执行器与活动任务数
 */
router.get("/health", queryHealth);

/**
 * @swagger
 * /api/health/query:
 *   get:
 *     summary: 健康检查别名
 *     tags: [System]
 *     responses:
 *       200:
 *         description: 与 /api/health 返回一致
 */
router.get("/health/query", queryHealth);

export default router;
