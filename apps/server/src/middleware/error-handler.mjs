/**
 * @fileoverview
 * Express 后端的错误处理中间件模块，负责处理跨接口复用的请求生命周期逻辑。
 *
 * 主要职责：
 * - 对外暴露：notFoundApiMiddleware、errorHandlerMiddleware。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 在请求进入控制器前后统一处理异常、日志或响应格式。
 * - 将重复的横切关注点从控制器和服务中抽离。
 */

import { HttpError } from "../lib/http-error.mjs";

export function notFoundApiMiddleware(request, response, next) {
  if (request.path.startsWith("/api/")) {
    response.status(404).json({
      status: "error",
      message: `接口不存在: ${request.originalUrl}`,
      datum: null,
    });
    return;
  }

  next();
}

export function errorHandlerMiddleware(error, request, response, next) { // eslint-disable-line no-unused-vars
  request.request_logger?.logError(error);

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({
      status: "error",
      message: error.message,
      datum: error.datum,
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      status: "error",
      message: "请求体不是合法 JSON",
      datum: null,
    });
    return;
  }

  response.status(500).json({
    status: "error",
    message: error instanceof Error ? error.message : String(error),
    datum: null,
  });
}
