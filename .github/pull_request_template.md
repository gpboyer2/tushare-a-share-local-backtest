# 变更说明

请直接说明：

- 改了什么
- 为什么要改

# 影响范围

请列出受影响模块：

- 数据同步
- 数据校验
- 回测主链路
- 前端工作台
- 数据库管理
- 文档

# 验证方式

请写清楚你实际执行过什么：

- [ ] `./.venv/bin/python -m pytest test/test_data_sync.py test/test_data_validation.py -q`
- [ ] `./.venv/bin/python -m compileall src scripts`
- [ ] `npm run typecheck --workspace @ppll-chinese-a/web`
- [ ] `npm run build:web`
- [ ] 其他验证，已写在下方

补充说明：

```text
把你实际执行过的命令、日志摘要、截图说明写在这里
```

# 风险与限制

- 有没有已知限制
- 有没有还没覆盖的边界情况
