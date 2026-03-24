/**
 * @fileoverview
 * 共享契约层的工作台共享契约定义模块，负责定义前后端共享的类型约定和数据结构。
 *
 * 主要职责：
 * - 对外暴露：模块级常量、类型或默认导出。
 * - 为当前前端页面、组件或共享契约层提供明确的单一职责能力。
 *
 * 实现方式：
 * - 把页面、服务端和共享包共用的接口结构抽到同一处维护。
 * - 降低前后端对字段和返回格式理解不一致的风险。
 */

export type StrategyRule = {
  id: string;
  title: string;
  summary: string;
};

export type StrategyDraft = {
  id: string;
  name: string;
  modeLabel: string;
  description: string;
  version: string;
  backtestWindow: string;
  universeLabel: string;
  rules: StrategyRule[];
  executionPorts: string[];
  workspaceZones: string[];
};

export type BacktestConfig = {
  data_dir: string;
  output_dir: string;
  tushare_token_env: string;
  optional_endpoints: {
    namechange_for_st: boolean;
  };
  backtest: {
    start_date: string;
    end_date: string;
    initial_cash: number;
    commission_rate: number;
    tax_rate: number;
    min_commission: number;
  };
  strategy: {
    display_top_n: number;
    auto_buy_stock_count: number;
    initial_position_amount: number;
    grid_trade_amount: number;
    grid_atr_period: number;
    grid_atr_multiplier: number;
    grid_sell_profit_ratio: number;
    grid_risk_control_ratio: number;
    breakout_doubled_ratio: number;
    breakout_reduction_ratio: number;
    breakout_volume_threshold: number;
    breakout_decline_threshold: number;
    breakout_turnover_threshold: number;
    breakout_target_hold_count: number;
    ma_fitting_threshold: number;
    ma_fitting_min_months: number;
    ma_periods: number[];
    volume_check_days: number;
    max_pe_ratio: number;
    price_position_threshold: number;
    min_per_capital_amount: number;
    min_roe: number;
    roe_years: number;
    filter_new_stock_days: number;
    filter_kcbj: boolean;
    filter_st: boolean;
    use_namechange_for_st_filter: boolean;
    approximation_mode: string;
  };
};

export type FormFieldType = "text" | "number" | "date" | "boolean";

export type ConfigFormField = {
  path: string;
  label: string;
  type: FormFieldType;
  description: string;
  step?: number;
  value: string | number | boolean;
};

export type ConfigFormGroup = {
  id: string;
  title: string;
  fields: ConfigFormField[];
};

export type BacktestSummary = {
  start_date: string;
  end_date: string;
  start_value: number;
  end_value: number;
  total_return: number;
  annual_return: number;
  max_drawdown: number;
  trade_count: number;
  buy_count: number;
  sell_count: number;
  holding_count: number;
};

export type EquityPoint = {
  trade_date: string;
  cash: number;
  market_value: number;
  total_equity: number;
};

export type TradeRecord = {
  trade_date: string;
  ts_code: string;
  side: string;
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  cash_after: number;
  reason: string;
};

export type ScreeningRecord = {
  trade_date: string;
  trigger: string;
  candidate_count: number;
  passed_count: number;
  selected_codes: string;
  selected_names: string;
  top_scores: string;
  details: string;
};

export type LogEntry = {
  time: string;
  message: string;
};

export type BacktestRunResult = {
  run_id: string;
  output_dir: string;
  summary: BacktestSummary;
  equity_curve: EquityPoint[];
  trades: TradeRecord[];
  screenings: ScreeningRecord[];
};

export type BacktestRunStatus = "queued" | "running" | "finished" | "failed";

export type BacktestRunItem = {
  id: string;
  status: BacktestRunStatus;
  label: string;
  startedAt: string;
  finishedAt: string;
  summary: BacktestSummary | null;
};

export type BacktestRunDetail = BacktestRunItem & {
  result: BacktestRunResult | null;
  logs: LogEntry[];
  error: string;
  outputDir: string;
  config?: BacktestConfig;
};

export type WorkbenchBootstrap = {
  strategy: StrategyDraft;
  config: BacktestConfig;
  formGroups: ConfigFormGroup[];
  latestRuns: BacktestRunItem[];
};

export type BacktestRunRequest = {
  config: BacktestConfig;
};
