/**
 * @fileoverview
 * Express 启动入口模块，负责创建应用实例并监听 HTTP 端口。
 *
 * 主要职责：
 * - 对外暴露：模块级常量、类型或默认导出。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 读取服务配置。
 * - 调用 `createApp()` 完成装配。
 * - 启动监听并输出服务启动信息。
 */

import { createApp } from "./app.mjs";
import { DEFAULT_PORT } from "./config/server.mjs";

const app = createApp();

app.listen(DEFAULT_PORT, () => {
  console.log(`PPLL workbench server listening on http://localhost:${DEFAULT_PORT}`);
});
