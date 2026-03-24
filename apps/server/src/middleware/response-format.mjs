/**
 * @fileoverview
 * Express 后端的响应格式中间件模块，负责处理跨接口复用的请求生命周期逻辑。
 *
 * 主要职责：
 * - 对外暴露：responseFormatMiddleware。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 在请求进入控制器前后统一处理异常、日志或响应格式。
 * - 将重复的横切关注点从控制器和服务中抽离。
 */

import { sendApiError, sendApiSuccess } from "../lib/response.mjs";

export function responseFormatMiddleware(request, response, next) {
  response.apiSuccess = (datum, message = "操作成功", statusCode = 200) => {
    sendApiSuccess(response, datum, message, statusCode);
  };

  response.apiError = (message = "操作失败", datum = null, statusCode = 200) => {
    sendApiError(response, message, datum, statusCode);
  };

  next();
}
