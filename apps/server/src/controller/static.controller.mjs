/**
 * @fileoverview
 * Express 后端的前端静态资源控制器，负责把 HTTP 请求参数转成服务层调用并返回统一响应。
 *
 * 主要职责：
 * - 对外暴露：serveStaticApp。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 从 `req.query` 或 `req.body` 读取参数并做轻量整理。
 * - 调用对应 service 模块完成业务动作。
 * - 通过统一响应格式把结果返回给前端。
 */

import { promises as fs } from "node:fs";
import { WEB_DIST_DIR } from "../config/paths.mjs";
import { resolveStaticAssetPath, getMimeType } from "../lib/static-assets.mjs";

export async function serveStaticApp(request, response) {
  const resolvedPath = await resolveStaticAssetPath(request.path);

  if (!resolvedPath) {
    response.status(404).type("text/plain; charset=utf-8").send("前端构建产物不存在，请先执行 npm run build:web");
    return;
  }

  const content = await fs.readFile(resolvedPath);
  if (resolvedPath.startsWith(WEB_DIST_DIR)) {
    response.status(200).setHeader("Content-Type", getMimeType(resolvedPath));
    response.send(content);
    return;
  }

  response.status(403).type("text/plain; charset=utf-8").send("Forbidden");
}
