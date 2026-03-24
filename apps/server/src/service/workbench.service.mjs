/**
 * @fileoverview
 * Express 后端的工作台服务层，负责承接控制器请求并组织具体业务实现。
 *
 * 主要职责：
 * - 对外暴露：loadDefaultConfig、buildWorkbenchBootstrap、normalizeConfig、validateConfig、clone、getPath。
 * - 在当前后端分层结构中承担清晰的单一职责。
 *
 * 实现方式：
 * - 封装与 Python 脚本、文件系统、历史结果或数据库桥接相关的业务动作。
 * - 对控制器隐藏底层执行细节和错误处理约定。
 * - 输出适合 API 层消费的结构化结果。
 */

import { BACKTEST_FORM_GROUPS, STRATEGY_RULES } from "../config/workbench.mjs";
import { DEFAULT_CONFIG_PATH } from "../config/paths.mjs";
import { readJson } from "../lib/file-system.mjs";
import { listHistoricalRuns } from "./backtest-history.service.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPath(target, pathValue) {
  return pathValue.split(".").reduce((currentValue, key) => currentValue?.[key], target);
}

export function normalizeConfig(rawConfig) {
  const nextConfig = clone(rawConfig);

  nextConfig.backtest.initial_cash = Number(nextConfig.backtest.initial_cash);
  nextConfig.backtest.commission_rate = Number(nextConfig.backtest.commission_rate);
  nextConfig.backtest.tax_rate = Number(nextConfig.backtest.tax_rate);
  nextConfig.backtest.min_commission = Number(nextConfig.backtest.min_commission);
  nextConfig.strategy.display_top_n = Number(nextConfig.strategy.display_top_n);
  nextConfig.strategy.auto_buy_stock_count = Number(nextConfig.strategy.auto_buy_stock_count);
  nextConfig.strategy.initial_position_amount = Number(nextConfig.strategy.initial_position_amount);
  nextConfig.strategy.grid_trade_amount = Number(nextConfig.strategy.grid_trade_amount);
  nextConfig.strategy.grid_atr_period = Number(nextConfig.strategy.grid_atr_period);
  nextConfig.strategy.grid_atr_multiplier = Number(nextConfig.strategy.grid_atr_multiplier);
  nextConfig.strategy.grid_sell_profit_ratio = Number(nextConfig.strategy.grid_sell_profit_ratio);
  nextConfig.strategy.grid_risk_control_ratio = Number(nextConfig.strategy.grid_risk_control_ratio);
  nextConfig.strategy.breakout_doubled_ratio = Number(nextConfig.strategy.breakout_doubled_ratio);
  nextConfig.strategy.breakout_reduction_ratio = Number(nextConfig.strategy.breakout_reduction_ratio);
  nextConfig.strategy.breakout_volume_threshold = Number(nextConfig.strategy.breakout_volume_threshold);
  nextConfig.strategy.breakout_decline_threshold = Number(nextConfig.strategy.breakout_decline_threshold);
  nextConfig.strategy.breakout_turnover_threshold = Number(nextConfig.strategy.breakout_turnover_threshold);
  nextConfig.strategy.breakout_target_hold_count = Number(nextConfig.strategy.breakout_target_hold_count);
  nextConfig.strategy.ma_fitting_threshold = Number(nextConfig.strategy.ma_fitting_threshold);
  nextConfig.strategy.ma_fitting_min_months = Number(nextConfig.strategy.ma_fitting_min_months);
  nextConfig.strategy.volume_check_days = Number(nextConfig.strategy.volume_check_days);
  nextConfig.strategy.max_pe_ratio = Number(nextConfig.strategy.max_pe_ratio);
  nextConfig.strategy.price_position_threshold = Number(nextConfig.strategy.price_position_threshold);
  nextConfig.strategy.min_per_capital_amount = Number(nextConfig.strategy.min_per_capital_amount);
  nextConfig.strategy.min_roe = Number(nextConfig.strategy.min_roe);
  nextConfig.strategy.roe_years = Number(nextConfig.strategy.roe_years);
  nextConfig.strategy.filter_new_stock_days = Number(nextConfig.strategy.filter_new_stock_days);
  nextConfig.strategy.filter_kcbj = Boolean(nextConfig.strategy.filter_kcbj);
  nextConfig.strategy.filter_st = Boolean(nextConfig.strategy.filter_st);
  nextConfig.strategy.use_namechange_for_st_filter = Boolean(nextConfig.strategy.use_namechange_for_st_filter);
  nextConfig.optional_endpoints.namechange_for_st = Boolean(nextConfig.optional_endpoints.namechange_for_st);

  return nextConfig;
}

export function validateConfig(config) {
  if (!config.backtest.start_date || !config.backtest.end_date) {
    return "回测起止日期不能为空。";
  }

  if (config.backtest.start_date > config.backtest.end_date) {
    return "开始日期不能晚于结束日期。";
  }

  if (config.backtest.initial_cash <= 0) {
    return "初始资金必须大于 0。";
  }

  return "";
}

export async function loadDefaultConfig() {
  return normalizeConfig(await readJson(DEFAULT_CONFIG_PATH));
}

export async function buildWorkbenchBootstrap() {
  const config = await loadDefaultConfig();
  const latestRuns = await listHistoricalRuns();

  return {
    strategy: {
      id: "jq-grid-breakout-v1",
      name: "选股做多网格突破减仓策略",
      modeLabel: "JoinQuant 风格网页工作台",
      description: "网页端通过 Node 编排层桥接 Python 回测主线，可直接发起回测并查看结果。",
      version: "web.2026.03.23",
      backtestWindow: `${config.backtest.start_date} ~ ${config.backtest.end_date}`,
      universeLabel: "沪深主板 + 多重过滤",
      rules: STRATEGY_RULES,
      executionPorts: [
        "GET /api/workbench/query",
        "GET /api/backtests/query",
        "GET /api/backtests/detail/query",
        "POST /api/backtests/create",
      ],
      workspaceZones: ["顶栏", "左侧资源区", "中央编辑区", "右侧参数区", "底部结果区"],
    },
    config,
    formGroups: BACKTEST_FORM_GROUPS.map((group) => ({
      ...group,
      fields: group.fields.map((field) => ({
        ...field,
        value: getPath(config, field.path),
      })),
    })),
    latestRuns,
  };
}
