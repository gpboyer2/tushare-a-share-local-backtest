# Server Workspace

该目录现在是基于 Express 的轻量 MVC 后端。

## 当前分层

- `src/server.mjs`
  - 进程入口，只负责启动 HTTP 服务
- `src/app.mjs`
  - 应用装配层，负责中间件、路由、Swagger、错误处理和静态资源托管
- `src/router`
  - 路由注册层，按 `system / workbench / backtests / database` 分模块组织
- `src/controller`
  - 控制器层，负责读取 `req.query`、`req.body` 并输出响应
- `src/service`
  - 业务编排层，负责回测任务管理、工作台初始化和 SQLite bridge 调用
- `src/runtime`
  - 运行态存储，目前承载回测任务内存状态
- `src/lib`
  - 通用工具，包括响应封装、文件读写、Python 桥接、静态资源和错误模型
- `src/middleware`
  - 横切逻辑，包括请求日志、统一响应格式和错误处理

## 启动方式

- 开发:
  - `npm run dev --workspace @ppll-chinese-a/server`
- 启动:
  - `npm run start --workspace @ppll-chinese-a/server`
- 文档:
  - `http://localhost:8787/api/docs`

## 当前主接口

- `GET /api/health`
- `GET /api/workbench/query`
- `GET /api/backtests/query`
- `GET /api/backtests/detail/query?run_id=...`
- `POST /api/backtests/create`
- `GET /api/database/query`
- `GET /api/database/table/query?table_name=...`
- `GET /api/database/table/count/query?table_name=...`
- `GET /api/database/data/query?...`
- `POST /api/database/sql/query`
- `POST /api/database/row/create`
- `POST /api/database/row/update`
- `POST /api/database/row/delete`

## 兼容说明

- 为避免联调期断路，保留了旧接口别名:
  - `GET /api/workbench`
  - `GET /api/backtests`
  - `POST /api/backtests`
  - `GET /api/backtests/:run_id`
