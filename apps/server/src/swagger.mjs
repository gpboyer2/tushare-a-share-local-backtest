/**
 * @fileoverview
 * Swagger 装配模块，负责把接口文档挂载到 Express 服务。
 *
 * 主要职责：
 * - 对外暴露：registerSwagger。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 汇总 OpenAPI 描述。
 * - 注册 Swagger UI 和相关路由。
 */

import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { DEFAULT_PORT } from "./config/server.mjs";
import { SERVER_ROOT } from "./config/paths.mjs";

export function registerSwagger(app) {
  const specs = swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Tushare Local Backtest Server API",
        version: "0.2.0",
        description: "本地回测工作台后端 API 文档",
      },
      servers: [
        {
          url: `http://localhost:${DEFAULT_PORT}`,
        },
      ],
    },
    apis: [path.join(SERVER_ROOT, "src/router/*.mjs")],
  });

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
  }));
}
