/**
 * @fileoverview
 * Express 后端的路由聚合路由模块，负责注册该领域的 HTTP 接口和中间件链路。
 *
 * 主要职责：
 * - 对外暴露：registerRoutes。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 定义接口路径、HTTP 方法和控制器绑定关系。
 * - 按模块把系统、工作台、回测、数据库等路由聚合到应用中。
 */

import systemRouter from "./system.router.mjs";
import workbenchRouter from "./workbench.router.mjs";
import backtestRouter from "./backtest.router.mjs";
import databaseRouter from "./database.router.mjs";

export function registerRoutes(app) {
  app.use("/api", systemRouter);
  app.use("/api/workbench", workbenchRouter);
  app.use("/api/backtests", backtestRouter);
  app.use("/api/database", databaseRouter);
}
