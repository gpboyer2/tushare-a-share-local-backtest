# 贡献指南

感谢你愿意参与这个项目。

这个项目当前聚焦中国 A 股、本地 SQLite 数据缓存、Tushare 数据同步和策略回测。为了保证质量，所有贡献默认按“先可验证、再合并”的原则处理。

## 1. 提交前先做什么

请先确认你改动的是哪一类问题：

- 文档修正
- 缺陷修复
- 数据同步能力增强
- 回测引擎能力增强
- 策略逻辑增强
- 前端工作台或数据库管理能力增强

如果改动比较大，建议先提 Issue 说明：

- 你要解决什么问题
- 当前行为是什么
- 期望行为是什么
- 会影响哪些模块

## 2. 基本要求

### 代码要求

- 保持现有项目结构，不随意重排目录
- 不提交真实数据、数据库文件、日志文件、虚拟环境目录
- 不提交任何真实 Token、账号、密钥
- 改动业务逻辑时，必须同步更新相关文档或注释
- 新增文件头注释时，保持当前项目已经采用的中文说明风格

### 接口和数据要求

- 不要在公开仓库中提交 Tushare 原始数据
- 不要把本地 `data_cache.db`、`.db-wal`、`.db-shm` 提交到仓库
- 所有涉及数据完整性和回测结果的改动，必须说明验证方式

## 3. 提交前自检

至少执行下面这些命令中的相关部分：

```bash
./.venv/bin/python -m pytest test/test_data_sync.py test/test_data_validation.py -q
./.venv/bin/python -m compileall src scripts
npm run typecheck --workspace @ppll-chinese-a/web
npm run build:web
```

如果你改的是数据全量校验链路，建议额外执行：

```bash
./.venv/bin/python scripts/validate_data_completeness.py \
  --config config/backtest.fullsync.json \
  --db data_cache.db \
  --report outputs/data_completeness_report.json
```

如果你改的是回测主链路，建议额外执行：

```bash
./.venv/bin/python scripts/run_backtest.py --config config/backtest.json
```

## 4. Pull Request 要写什么

PR 描述请至少包含：

- 改了什么
- 为什么要改
- 影响哪些模块
- 怎么验证
- 有没有已知限制

如果是界面改动，建议附截图。
如果是数据同步或校验逻辑改动，建议附关键日志或报告摘要。

## 5. 不建议的改法

- 直接提交真实数据库
- 为了“兼容”引入大量模糊逻辑
- 不验证就宣称“已经修好”
- 只改代码，不同步文档
- 一次 PR 混合太多无关改动

## 6. 合并标准

维护者通常只会优先合并下面这类改动：

- 问题定义清楚
- 影响范围明确
- 验证证据完整
- 不引入新的敏感信息风险
- 不破坏当前主要流程

## 7. 沟通语言

本项目默认使用中文沟通和中文文档。
