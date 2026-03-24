"""
@fileoverview
项目配置解析模块，负责读取 JSON 配置并标准化为强类型设置对象。

主要职责：
- 对外暴露：OptionalEndpointSettings、DataSyncConfig、BacktestRuntimeConfig、StrategyConfig、BacktestSettings、_load_json、_resolve_project_root、_normalize_config_date。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 读取 JSON 配置文件并补齐默认值。
- 规范化日期、路径和各类子配置。
- 把原始配置转成 `BacktestSettings` 及其子配置对象。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class OptionalEndpointSettings:
    namechange_for_st: bool = False


@dataclass(slots=True)
class DataSyncConfig:
    start_date: str = "1990-01-01"
    end_date: str = "today"
    request_interval_seconds: float = 0.15
    retry_times: int = 5
    retry_backoff_seconds: float = 0.6


@dataclass(slots=True)
class BacktestRuntimeConfig:
    start_date: str
    end_date: str
    initial_cash: float = 300000.0
    commission_rate: float = 0.0003
    tax_rate: float = 0.001
    min_commission: float = 5.0
    progress_log_interval: int = 20


@dataclass(slots=True)
class StrategyConfig:
    display_top_n: int = 3
    auto_buy_stock_count: int = 3
    initial_position_amount: float = 30000.0
    grid_trade_amount: float = 10000.0
    grid_atr_period: int = 14
    grid_atr_multiplier: float = 0.5
    grid_sell_profit_ratio: float = 1.01
    grid_risk_control_ratio: float = 0.8
    breakout_doubled_ratio: float = 2.0
    breakout_reduction_ratio: float = 1.0 / 3.0
    breakout_volume_threshold: float = 2.5
    breakout_decline_threshold: float = 0.05
    breakout_turnover_threshold: float = 10.0
    breakout_target_hold_count: int = 3
    ma_fitting_threshold: float = 0.1
    ma_fitting_min_months: int = 24
    ma_periods: list[int] = field(default_factory=lambda: [5, 10, 20, 30, 60])
    volume_check_days: int = 15
    max_pe_ratio: float = 20.0
    price_position_threshold: float = 0.4
    min_per_capital_amount: float = 220000.0
    min_roe: float = 0.1
    roe_years: int = 3
    filter_new_stock_days: int = 375
    filter_kcbj: bool = True
    filter_st: bool = True
    use_namechange_for_st_filter: bool = False
    approximation_mode: str = "daily"


@dataclass(slots=True)
class BacktestSettings:
    project_root: Path
    data_dir: Path
    output_dir: Path
    tushare_token_env: str
    optional_endpoints: OptionalEndpointSettings
    data_sync: DataSyncConfig
    backtest: BacktestRuntimeConfig
    strategy: StrategyConfig


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _resolve_project_root(config_path: Path, raw: dict[str, Any]) -> Path:
    explicit_root = raw.get("project_root")
    if explicit_root:
        return Path(explicit_root).expanduser().resolve()

    current = config_path.parent
    while current != current.parent:
        if (current / "pyproject.toml").exists() and (current / "src").exists():
            return current.resolve()
        current = current.parent

    return config_path.parent.parent.resolve()


def _normalize_config_date(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    raw = str(value).strip()
    if not raw:
        return fallback
    if raw.lower() == "today":
        return date.today().strftime("%Y-%m-%d")
    if len(raw) == 8 and raw.isdigit():
        return f"{raw[:4]}-{raw[4:6]}-{raw[6:]}"
    return raw


def load_settings(config_path: str | Path) -> BacktestSettings:
    path = Path(config_path).expanduser().resolve()
    raw = _load_json(path)
    project_root = _resolve_project_root(path, raw)
    data_dir_raw = raw.get("data_dir", raw.get("data_path", "data_cache.db"))
    data_dir = (project_root / data_dir_raw).resolve()
    output_dir = (project_root / raw.get("output_dir", "outputs")).resolve()
    optional_endpoints = OptionalEndpointSettings(**raw.get("optional_endpoints", {}))
    raw_sync = raw.get("data_sync", {})
    data_sync = DataSyncConfig(
        start_date=_normalize_config_date(raw_sync.get("start_date"), "1990-01-01"),
        end_date=_normalize_config_date(raw_sync.get("end_date"), date.today().strftime("%Y-%m-%d")),
        request_interval_seconds=float(raw_sync.get("request_interval_seconds", 0.15)),
        retry_times=int(raw_sync.get("retry_times", 5)),
        retry_backoff_seconds=float(raw_sync.get("retry_backoff_seconds", 0.6)),
    )
    backtest_raw = raw["backtest"].copy()
    backtest_raw["start_date"] = _normalize_config_date(backtest_raw.get("start_date"), "2023-01-01")
    backtest_raw["end_date"] = _normalize_config_date(backtest_raw.get("end_date"), date.today().strftime("%Y-%m-%d"))
    backtest_raw["progress_log_interval"] = int(backtest_raw.get("progress_log_interval", 20))
    backtest = BacktestRuntimeConfig(**backtest_raw)
    strategy = StrategyConfig(**raw["strategy"])
    return BacktestSettings(
        project_root=project_root,
        data_dir=data_dir,
        output_dir=output_dir,
        tushare_token_env=raw.get("tushare_token_env", "TUSHARE_TOKEN"),
        optional_endpoints=optional_endpoints,
        data_sync=data_sync,
        backtest=backtest,
        strategy=strategy,
    )
