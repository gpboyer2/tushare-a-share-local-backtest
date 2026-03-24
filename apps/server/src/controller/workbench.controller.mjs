/**
 * @fileoverview
 * Express 后端的工作台控制器，负责把 HTTP 请求参数转成服务层调用并返回统一响应。
 *
 * 主要职责：
 * - 对外暴露：queryWorkbench。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 从 `req.query` 或 `req.body` 读取参数并做轻量整理。
 * - 调用对应 service 模块完成业务动作。
 * - 通过统一响应格式把结果返回给前端。
 */

import { buildWorkbenchBootstrap } from "../service/workbench.service.mjs";

export async function queryWorkbench(request, response) {
  response.status(200).json(await buildWorkbenchBootstrap());
}
