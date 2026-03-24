/**
 * @fileoverview
 * Express 后端的异步处理中间件模块，负责处理跨接口复用的请求生命周期逻辑。
 *
 * 主要职责：
 * - 对外暴露：asyncHandler、wrappedHandler。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 在请求进入控制器前后统一处理异常、日志或响应格式。
 * - 将重复的横切关注点从控制器和服务中抽离。
 */

export function asyncHandler(handler) {
  return async function wrappedHandler(request, response, next) {
    try {
      await handler(request, response, next);
    } catch (error) {
      next(error);
    }
  };
}
