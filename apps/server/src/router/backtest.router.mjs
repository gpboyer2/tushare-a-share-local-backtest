/**
 * @fileoverview
 * Express 后端的回测路由模块，负责注册该领域的 HTTP 接口和中间件链路。
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
  createBacktest,
  queryBacktestDetail,
  queryBacktestDetailLegacy,
  queryBacktests,
} from "../controller/backtest.controller.mjs";
import { asyncHandler } from "../middleware/async-handler.mjs";

const router = Router();

/**
 * @swagger
 * /api/backtests/query:
 *   get:
 *     summary: 查询回测任务列表
 *     tags: [Backtests]
 *     responses:
 *       200:
 *         description: 返回活动任务和历史任务合并结果
 */
router.get("/query", asyncHandler(queryBacktests));

/**
 * @swagger
 * /api/backtests/detail/query:
 *   get:
 *     summary: 查询单个回测任务详情
 *     tags: [Backtests]
 *     parameters:
 *       - in: query
 *         name: run_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 返回单个回测任务详情
 */
router.get("/detail/query", asyncHandler(queryBacktestDetail));

/**
 * @swagger
 * /api/backtests/create:
 *   post:
 *     summary: 创建回测任务
 *     tags: [Backtests]
 *     responses:
 *       202:
 *         description: 任务已创建并进入执行队列
 */
router.post("/create", asyncHandler(createBacktest));

router.get("/", asyncHandler(queryBacktests));
router.post("/", asyncHandler(createBacktest));
router.get("/:run_id", asyncHandler(queryBacktestDetailLegacy));

export default router;
