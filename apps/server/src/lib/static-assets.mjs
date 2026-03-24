/**
 * @fileoverview
 * Express 后端的静态资源工具模块，负责为上层业务提供可复用的基础能力。
 *
 * 主要职责：
 * - 对外暴露：resolveStaticAssetPath、getMimeType。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装文件系统、Python 子进程、响应格式、请求日志或静态资源解析等细节。
 * - 被 controller、service、middleware 或 app 层复用。
 */

import path from "node:path";
import { WEB_DIST_DIR } from "../config/paths.mjs";
import { safeExists } from "./file-system.mjs";

export function getMimeType(filePath) {
  const extension = path.extname(filePath);

  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export async function resolveStaticAssetPath(requestPath) {
  const sanitizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const candidatePath = path.resolve(path.join(WEB_DIST_DIR, sanitizedPath));
  const distRoot = path.resolve(WEB_DIST_DIR);

  if (!candidatePath.startsWith(distRoot)) {
    return null;
  }

  if (await safeExists(candidatePath)) {
    return candidatePath;
  }

  const indexPath = path.join(WEB_DIST_DIR, "index.html");
  if (await safeExists(indexPath)) {
    return indexPath;
  }

  return null;
}
