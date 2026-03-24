# 更新记录

## 2026-03-24

- 子项目独立初始化 Git 仓库并发布到 GitHub：`gpboyer2/tushare-a-share-local-backtest`
- 清理发布前敏感风险：移除明文 Tushare Token 默认值
- 补强 `.gitignore`，忽略数据库、SQLite 伴生文件、虚拟环境、日志、临时目录和生成元数据
- 为业务代码文件统一补齐文件头注释
- 新增数据全量校验使用手册
- 补齐开源治理基础文件：`LICENSE`、`CONTRIBUTING.md`、`SECURITY.md`、`DISCLAIMER.md`、`DATA_POLICY.md`、`CODE_OF_CONDUCT.md`
- 新增 GitHub Actions CI、Issue 模板、PR 模板和开源发布检查清单

## 2026-03-23

- 修复 Tushare 大时间窗请求约 6000 行截断导致的历史漏数问题
- 新增真正可跑的数据完整性校验链路
- 完成一次完整性校验与正式回测验收
