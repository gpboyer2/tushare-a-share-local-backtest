/**
 * @fileoverview
 * Express 后端的HTTP 错误工具模块，负责为上层业务提供可复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：createBadRequestError、createNotFoundError、HttpError。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装文件系统、Python 子进程、响应格式、请求日志或静态资源解析等细节。
 * - 被 controller、service、middleware 或 app 层复用。
 */

export class HttpError extends Error {
  constructor(statusCode, message, datum = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.datum = datum;
  }
}

export function createBadRequestError(message, datum = null) {
  return new HttpError(400, message, datum);
}

export function createNotFoundError(message, datum = null) {
  return new HttpError(404, message, datum);
}
