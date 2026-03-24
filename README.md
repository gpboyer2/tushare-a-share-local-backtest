# Tushare 本地回测使用手册

这个项目的核心不是网页，而是：

1. 先把 Tushare 数据同步到本地 SQLite。
2. 再用本地数据跑回测。
3. 最后查看结果、日志，必要时改配置或改策略代码继续重跑。

如果你只想快速上手，先看“主要使用流程”。

## 1. 主要使用流程

### 第一步：检查环境和配置

先确认这几件事：

- Python 版本不低于 3.10
- 有可用的 Tushare Token
- 当前项目根目录下有可写权限
- 回测配置文件已经确认，默认用 `config/backtest.json`

安装 Python 依赖：

```bash
cd /Users/peng/Desktop/Project/0-ppll/ppll-chinese-a/tushare_local_backtest
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt
```

设置 Tushare Token：

```bash
export TUSHARE_TOKEN=你的token
```

建议先看一眼配置文件：

- `config/backtest.json`：默认运行配置
- `config/backtest.example.json`：配置样例
- `config/backtest.fullsync.json`：偏向全量同步和验收

最少要关注这些字段：

- `data_sync.start_date`
- `data_sync.end_date`
- `backtest.start_date`
- `backtest.end_date`
- `strategy.auto_buy_stock_count`
- `strategy.initial_position_amount`

### 第二步：初始化数据

先同步数据，再谈回测。没有本地数据，回测本身就不成立。

常用命令：

```bash
./.venv/bin/python scripts/download_data.py --config config/backtest.json
```

如果你只是先试跑，减少同步范围更实际：

```bash
./.venv/bin/python scripts/download_data.py --config config/backtest.json --limit 200
```

同步完成后重点看两样东西：

- 终端最后的 `[done] 数据同步完成`
- `outputs/data_sync_report.json`

本地数据库默认是：

```text
data_cache.db
```

### 第三步：可选做一次完整性校验

这一步不是必须，但很建议做，特别是你准备正式跑长周期回测时。

```bash
./.venv/bin/python scripts/validate_data_completeness.py \
  --config config/backtest.fullsync.json \
  --db data_cache.db \
  --report outputs/data_completeness_report.json
```

判断方式很简单：

- 退出码是 `0`：当前校验口径下通过
- 退出码不是 `0`：说明至少有一类失败项，要看报告

重点报告文件：

- `outputs/data_completeness_report.json`

注意：

- 不要一边做完整性校验，一边跑回测
- 两者同时占用同一个 `data_cache.db`，容易出现 `database is locked`

### 第四步：执行回测

```bash
./.venv/bin/python scripts/run_backtest.py --config config/backtest.json
```

回测时会持续打印进度日志，格式类似：

```text
[progress] phase=running step=20/244 trade_date=20230201 holdings=3 cash=...
```

回测完成后会输出：

- `[summary] ...`
- `[output] outputs/时间戳目录`

### 第五步：查看结果、日志、继续调试

每次回测结果都会落到一个新的输出目录，例如：

```text
outputs/20260323_111149/
```

重点看这几个文件：

- `summary.json`：收益、回撤、交易次数等汇总
- `equity_curve.csv`：每日净值曲线
- `trades.csv`：成交记录
- `screenings.csv`：每次选股记录

如果结果不对，排查顺序建议是：

1. 先看 `config/backtest.json` 参数是不是改错了
2. 再看 `outputs/.../screenings.csv`，确认选股阶段是不是已经偏了
3. 再看 `trades.csv`，确认买卖触发点是不是和预期一致
4. 最后再去看策略代码和数据层代码

最常看的源码位置：

- `scripts/download_data.py`：数据同步入口
- `scripts/validate_data_completeness.py`：数据验收入口
- `scripts/run_backtest.py`：回测入口
- `src/ppll_bt/data/sync.py`：Tushare 同步逻辑
- `src/ppll_bt/data/repository.py`：本地 SQLite 读取逻辑
- `src/ppll_bt/backtest/engine.py`：回测推进、撮合、资金和持仓
- `src/ppll_bt/strategy/joinquant_migrated.py`：策略主逻辑
- `src/ppll_bt/strategy/minute_extension.py`：分钟逻辑扩展位

## 2. 可选模块：网页工作台

这个模块不是必需的。核心回测只靠 Python 就能跑。

如果你想在网页里改参数、发起回测、看日志、看数据库，可以再启动它。

先安装 Node 依赖：

```bash
npm install
```

启动后端：

```bash
npm run dev:server
```

启动前端：

```bash
npm run dev:web
```

打开：

- 工作台：`http://localhost:5173/#/workbench`
- 数据库管理：`http://localhost:5173/#/database`
- Swagger：`http://localhost:8787/api/docs`

## 3. 关键词和术语解释

### 数据相关

- `data_cache.db`
  - 本地 SQLite 数据库，回测和数据库管理都默认读它。
- `trade_cal`
  - 交易日历。回测是按交易日推进，不是按自然日推进。
- `daily`
  - 日线行情。
- `daily_basic`
  - 每日指标，例如 `pe_ttm`、`circ_mv`、`turnover_rate`。
- `adj_factor`
  - 复权因子，用来把历史价格调整到可比口径。
- `fina_indicator`
  - 财务指标，这里主要用到 ROE。
- `stk_holdernumber`
  - 股东户数，用来估算人均持股金额。
- `namechange`
  - 股票更名记录，可选用于更严格的 ST 过滤。

### 回测相关

- `run_id`
  - 一次回测的唯一编号，通常也是输出目录名。
- `screenings.csv`
  - 选股过程的记录，不是成交记录。
- `trades.csv`
  - 实际买卖成交记录。
- `equity_curve.csv`
  - 账户每日权益变化。
- `summary.json`
  - 本次回测的汇总结果。

### 策略相关

- 月度选股
  - 每月第一个交易日收盘后选股。
- 次日开盘自动买入
  - 选中的股票不是当天收盘买，而是下一交易日开盘买。
- 日线近似
  - 当前没有分钟级数据权限，所以用日线信号近似分钟策略。
- 网格交易
  - 在基础持仓上，按价格波动做加仓和减仓。
- 突破减仓
  - 涨幅已经很大后，如果出现放量、大阴线、换手异常、周线死叉等信号，就减仓或清仓。
- 补位
  - 某只股票清仓后，如果持仓数低于目标值，再补做一次选股。

## 4. 公式解释

这里只写你真正会用到的主公式。

### 价格位置

```text
价格位置 = 当前前复权收盘价 / 历史前复权最高价
```

用途：

- 判断当前股价是不是还处在历史高位下方
- 默认要求不高于 `price_position_threshold`

### 人均持股金额

```text
人均持股金额 = 流通市值 / 股东人数
```

代码里实际使用的是：

```text
per_capital_amount = circ_mv * 10000 / holder_num
```

说明：

- `circ_mv` 是以“万元”为单位，所以会乘 `10000`
- 如果拿不到股东人数，当前实现会跳过这条，不直接卡死股票

### 均线拟合偏差

```text
均线拟合偏差 = std([MA5, MA10, MA20, MA30, MA60]) / mean([MA5, MA10, MA20, MA30, MA60])
```

用途：

- 看多条月线均线是不是足够贴合
- 偏差越小，说明均线越收敛、越“贴”

### 均线拟合得分

```text
拟合得分 = min(100, 连续满足拟合条件的月数 / ma_fitting_min_months * 100)
```

用途：

- 这是当前排序主分数
- 六条规则负责准入，均线拟合分负责排序

### 网格步长

```text
网格步长 = ATR × grid_atr_multiplier
```

用途：

- 决定下一格买入价离当前基准价有多远

### 网格卖出触发价

```text
网格卖出触发价 = 最近一笔可卖批次买入价 × grid_sell_profit_ratio
```

### 放量比

```text
放量比 = 当日成交量 / 前5日平均成交量
```

用途：

- 用于判断突破后的高位放量

### 大阴线跌幅

```text
跌幅 = (当日收盘价 - 前一日收盘价) / 前一日收盘价
```

### 回测总收益率

```text
总收益率 = 期末权益 / 期初权益 - 1
```

### 年化收益率

```text
年化收益率 = (1 + 总收益率) ^ (1 / 年数) - 1
```

### 最大回撤

```text
最大回撤 = 当日权益 / 历史最高权益 - 1 的最小值
```

## 5. 这个项目最容易遗漏的点

你说的主流程基本是对的，但如果只写成“初始化数据 -> 启动脚本 -> 看结果”，还少了几件很关键的事：

- 少了“先确认环境变量和配置”
  - 这个项目高度依赖 `TUSHARE_TOKEN` 和 `config/backtest.json`。
- 少了“数据校验”
  - 数据能下完，不等于数据一定完整可用。
- 少了“输出结果排查顺序”
  - 不是一出问题就先改代码，应该先看配置、再看选股记录、再看成交记录。
- 少了“并发占库风险”
  - 校验脚本和回测脚本不要同时跑同一个 SQLite。
- 少了“当前策略是日线近似，不是分钟原版”
  - 如果不写清楚，别人会误以为它和 JoinQuant 原盘中逻辑完全一致。
- 少了“网页工作台是可选模块，不是主流程”
  - 否则新人容易把精力放到前端启动上，反而忽略真正的回测主链。

所以，最简版正确说法应该是：

1. 先检查环境变量和配置。
2. 再同步本地数据。
3. 有条件的话做一次完整性校验。
4. 然后执行回测。
5. 最后看 summary、screenings、trades，再决定是改参数还是改代码。

## 6. 异常情况怎么办

- 下载数据失败
  - 先检查 `TUSHARE_TOKEN`、网络、Tushare 接口额度，再看 `outputs/data_sync_report.json`
- 回测没有成交
  - 先看 `screenings.csv` 是否根本没有选出股票
- 回测报数据缺失
  - 先重新同步，再做一次完整性校验
- 出现 `database is locked`
  - 停掉其他占用 `data_cache.db` 的进程，串行执行
- 网页端打不开数据
  - 先确认 `npm run dev:server` 和 `npm run dev:web` 都已经启动
- 想恢复分钟策略
  - 现在不要直接改主引擎，优先看 `src/ppll_bt/strategy/minute_extension.py`

## 7. 一句话总结

这个项目的正确使用顺序就是：

先配环境和参数，再同步数据，再验数据，再跑回测，最后根据结果去调参数或改策略。
