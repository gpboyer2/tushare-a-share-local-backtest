/**
 * @fileoverview
 * Express 后端的请求日志中间件模块，负责处理跨接口复用的请求生命周期逻辑。
 *
 * 主要职责：
 * - 对外暴露：requestLogMiddleware、requestBodyLogMiddleware。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 在请求进入控制器前后统一处理异常、日志或响应格式。
 * - 将重复的横切关注点从控制器和服务中抽离。
 */

import { createRequestLogger } from "../lib/request-log.mjs";

export function requestLogMiddleware(request, response, next) {
  const requestUrl = new URL(request.originalUrl || request.url || "/", `http://${request.headers.host || "localhost"}`);
  const requestLogger = createRequestLogger(request, response, requestUrl);

  request.request_logger = requestLogger;
  requestLogger.logStart();
  next();
}

export function requestBodyLogMiddleware(request, response, next) {
  if (request.body && Object.keys(request.body).length > 0) {
    request.request_logger?.setRequestBody(request.body);
  }
  next();
}
