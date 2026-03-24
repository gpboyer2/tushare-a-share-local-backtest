/**
 * @fileoverview
 * Express 后端的服务启动配置模块，负责提供服务启动与运行时依赖的静态配置。
 *
 * 主要职责：
 * - 对外暴露：DEFAULT_PORT、CORS_OPTIONS。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 集中声明环境变量、路径、端口、CORS 或工作台默认配置。
 * - 为 app、server 和 service 层提供统一配置来源。
 */

export const DEFAULT_PORT = Number(process.env.PORT || 8787);

export const CORS_OPTIONS = {
  origin: true,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};
