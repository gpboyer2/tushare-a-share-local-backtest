/**
 * @fileoverview
 * Express 后端的查询参数工具模块，负责为上层业务提供可复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：parseJsonParam。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装文件系统、Python 子进程、响应格式、请求日志或静态资源解析等细节。
 * - 被 controller、service、middleware 或 app 层复用。
 */

export function parseJsonParam(rawValue, fallbackValue) {
  if (!rawValue) {
    return fallbackValue;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallbackValue;
  }
}
