/**
 * @fileoverview
 * Express 应用装配模块，负责把中间件、路由、静态资源和 Swagger 文档拼装成完整应用。
 *
 * 主要职责：
 * - 对外暴露：createApp。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 创建 Express 实例并注册通用中间件。
 * - 挂载系统、工作台、回测、数据库等路由。
 * - 接入静态资源托管和 Swagger 文档页面。
 */

import "./config/env.mjs";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { CORS_OPTIONS } from "./config/server.mjs";
import { serveStaticApp } from "./controller/static.controller.mjs";
import { errorHandlerMiddleware, notFoundApiMiddleware } from "./middleware/error-handler.mjs";
import { requestBodyLogMiddleware, requestLogMiddleware } from "./middleware/request-log.mjs";
import { responseFormatMiddleware } from "./middleware/response-format.mjs";
import { registerRoutes } from "./router/index.mjs";
import { registerSwagger } from "./swagger.mjs";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(cors(CORS_OPTIONS));
  app.use(requestLogMiddleware);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(requestBodyLogMiddleware);
  app.use(responseFormatMiddleware);

  registerRoutes(app);
  registerSwagger(app);
  app.use(notFoundApiMiddleware);
  app.get("*", serveStaticApp);
  app.use(errorHandlerMiddleware);

  return app;
}
