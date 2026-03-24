/**
 * @fileoverview
 * Express 后端的回测控制器，负责把 HTTP 请求参数转成服务层调用并返回统一响应。
 *
 * 主要职责：
 * - 对外暴露：queryBacktests、queryBacktestDetail、queryBacktestDetailLegacy、createBacktest。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 从 `req.query` 或 `req.body` 读取参数并做轻量整理。
 * - 调用对应 service 模块完成业务动作。
 * - 通过统一响应格式把结果返回给前端。
 */

import { createBacktestRun, getBacktestRunDetail, listBacktestRuns } from "../service/backtest.service.mjs";

export async function queryBacktests(request, response) {
  response.status(200).json(await listBacktestRuns());
}

export async function queryBacktestDetail(request, response) {
  const runId = String(request.query.run_id || "");
  response.status(200).json(await getBacktestRunDetail(runId));
}

export async function queryBacktestDetailLegacy(request, response) {
  const runId = String(request.params.run_id || "");
  response.status(200).json(await getBacktestRunDetail(runId));
}

export async function createBacktest(request, response) {
  response.status(202).json(await createBacktestRun(request.body || {}));
}
