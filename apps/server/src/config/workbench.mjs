/**
 * @fileoverview
 * Express 后端的工作台配置模块，负责提供服务启动与运行时依赖的静态配置。
 *
 * 主要职责：
 * - 对外暴露：BACKTEST_FORM_GROUPS、STRATEGY_RULES。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 集中声明环境变量、路径、端口、CORS 或工作台默认配置。
 * - 为 app、server 和 service 层提供统一配置来源。
 */

export const BACKTEST_FORM_GROUPS = [
  {
    id: "runtime",
    title: "回测运行",
    fields: [
      { path: "backtest.start_date", label: "开始日期", type: "date", description: "回测起始交易日。" },
      { path: "backtest.end_date", label: "结束日期", type: "date", description: "回测结束交易日。" },
      { path: "backtest.initial_cash", label: "初始资金", type: "number", step: 10000, description: "账户初始资金。" },
      { path: "backtest.commission_rate", label: "佣金率", type: "number", step: 0.0001, description: "买卖双边佣金率。" },
      { path: "backtest.tax_rate", label: "印花税", type: "number", step: 0.0001, description: "卖出印花税。" },
      { path: "backtest.min_commission", label: "最低佣金", type: "number", step: 1, description: "单笔最低佣金。" },
    ],
  },
  {
    id: "positioning",
    title: "仓位与调仓",
    fields: [
      { path: "strategy.display_top_n", label: "展示候选数", type: "number", step: 1, description: "展示前 N 个候选。" },
      { path: "strategy.auto_buy_stock_count", label: "自动买入数", type: "number", step: 1, description: "自动建仓标的数。" },
      { path: "strategy.initial_position_amount", label: "单股初始建仓额", type: "number", step: 1000, description: "首次买入金额。" },
      { path: "strategy.breakout_target_hold_count", label: "目标持仓数", type: "number", step: 1, description: "突破补位后的目标持仓数。" },
    ],
  },
  {
    id: "grid",
    title: "网格参数",
    fields: [
      { path: "strategy.grid_trade_amount", label: "网格交易额", type: "number", step: 1000, description: "单次网格交易金额。" },
      { path: "strategy.grid_atr_period", label: "ATR 周期", type: "number", step: 1, description: "ATR 计算窗口。" },
      { path: "strategy.grid_atr_multiplier", label: "ATR 倍数", type: "number", step: 0.1, description: "网格步长倍数。" },
      { path: "strategy.grid_sell_profit_ratio", label: "止盈比例", type: "number", step: 0.01, description: "网格止盈比例。" },
      { path: "strategy.grid_risk_control_ratio", label: "风控比例", type: "number", step: 0.05, description: "网格风控阈值。" },
    ],
  },
  {
    id: "breakout",
    title: "突破减仓",
    fields: [
      { path: "strategy.breakout_doubled_ratio", label: "翻倍阈值", type: "number", step: 0.1, description: "盈利翻倍阈值。" },
      { path: "strategy.breakout_reduction_ratio", label: "减仓比例", type: "number", step: 0.05, description: "突破时减仓比例。" },
      { path: "strategy.breakout_volume_threshold", label: "放量阈值", type: "number", step: 0.1, description: "成交量阈值。" },
      { path: "strategy.breakout_decline_threshold", label: "回撤阈值", type: "number", step: 0.01, description: "突破回撤阈值。" },
      { path: "strategy.breakout_turnover_threshold", label: "换手阈值", type: "number", step: 0.1, description: "换手率阈值。" },
    ],
  },
  {
    id: "filters",
    title: "选股过滤",
    fields: [
      { path: "strategy.ma_fitting_threshold", label: "均线拟合阈值", type: "number", step: 0.01, description: "均线拟合度阈值。" },
      { path: "strategy.ma_fitting_min_months", label: "最小拟合月数", type: "number", step: 1, description: "均线拟合最少月数。" },
      { path: "strategy.volume_check_days", label: "量能检查天数", type: "number", step: 1, description: "成交量检查窗口。" },
      { path: "strategy.max_pe_ratio", label: "最大市盈率", type: "number", step: 0.5, description: "PE 上限。" },
      { path: "strategy.price_position_threshold", label: "价格位置阈值", type: "number", step: 0.01, description: "价格相对位置上限。" },
      { path: "strategy.min_per_capital_amount", label: "人均成交额", type: "number", step: 1000, description: "最小人均成交额。" },
      { path: "strategy.min_roe", label: "最小 ROE", type: "number", step: 0.01, description: "连续 ROE 下限。" },
      { path: "strategy.roe_years", label: "ROE 年数", type: "number", step: 1, description: "连续 ROE 年数。" },
      { path: "strategy.filter_new_stock_days", label: "新股过滤天数", type: "number", step: 1, description: "剔除上市不满 N 天的新股。" },
      { path: "strategy.filter_kcbj", label: "过滤科创北交", type: "boolean", description: "是否过滤科创板与北交所。" },
      { path: "strategy.filter_st", label: "过滤 ST", type: "boolean", description: "是否过滤 ST 股票。" },
      { path: "strategy.use_namechange_for_st_filter", label: "使用更名过滤 ST", type: "boolean", description: "是否使用 namechange 补充 ST 过滤。" },
      { path: "strategy.approximation_mode", label: "近似模式", type: "text", description: "当前默认 daily。" },
    ],
  },
];

export const STRATEGY_RULES = [
  { id: "rule-1", title: "月度盘后选股", summary: "每月首个交易日收盘后执行候选筛选。" },
  { id: "rule-2", title: "次日开盘买入", summary: "筛选结果在下个交易日开盘自动建仓。" },
  { id: "rule-3", title: "日线近似网格", summary: "当前使用日线近似替代分钟级网格与突破减仓。" },
  { id: "rule-4", title: "本地缓存数据", summary: "通过本地数据缓存驱动回测，避免网页端直接接触 Python 细节。" },
];
