/**
 * @fileoverview
 * Express 后端的统一响应工具模块，负责为上层业务提供可复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：sendJson、sendApiSuccess、sendApiError。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装文件系统、Python 子进程、响应格式、请求日志或静态资源解析等细节。
 * - 被 controller、service、middleware 或 app 层复用。
 */

export function sendJson(response, statusCode, payload) {
  response.status(statusCode).json(payload);
}

export function sendApiSuccess(response, datum, message = "操作成功", statusCode = 200) {
  sendJson(response, statusCode, {
    status: "success",
    message,
    datum,
  });
}

export function sendApiError(response, message = "操作失败", datum = null, statusCode = 200) {
  sendJson(response, statusCode, {
    status: "error",
    message,
    datum,
  });
}
