"""
@fileoverview
聚宽迁移版策略模块，负责选股、建仓、网格处理和减仓等交易规则实现。

主要职责：
- 对外暴露：_macd_cross、_compute_atr、ScreeningCandidate、JoinQuantMigratedStrategy。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 实现月线均线拟合、成交量、PE、回撤、股东人数、ROE 等选股规则。
- 实现建仓、补位、网格处理和翻倍减仓等交易逻辑。
- 通过引擎提供的数据仓库和组合状态完成策略决策。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from ppll_bt.config import StrategyConfig
from ppll_bt.data.repository import LocalDataRepository
from ppll_bt.strategy.minute_extension import DailyApproximationAdapter, IntradaySignalAdapter


def _macd_cross(close_series: pd.Series) -> tuple[bool, bool]:
    series = pd.to_numeric(close_series, errors="coerce").dropna()
    if len(series) < 35:
        return False, False
    ema_fast = series.ewm(span=12, adjust=False).mean()
    ema_slow = series.ewm(span=26, adjust=False).mean()
    macd = ema_fast - ema_slow
    signal = macd.ewm(span=9, adjust=False).mean()
    golden = macd.iloc[-2] < signal.iloc[-2] and macd.iloc[-1] > signal.iloc[-1]
    death = macd.iloc[-2] > signal.iloc[-2] and macd.iloc[-1] < signal.iloc[-1]
    return golden, death


def _compute_atr(frame: pd.DataFrame, period: int) -> float:
    history = frame.copy()
    for column in ["high", "low", "close"]:
        history[column] = pd.to_numeric(history[column], errors="coerce")
    history = history.dropna(subset=["high", "low", "close"])
    if len(history) < period + 1:
        return 0.0
    prev_close = history["close"].shift(1)
    true_range = pd.concat(
        [
            history["high"] - history["low"],
            (history["high"] - prev_close).abs(),
            (history["low"] - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr = true_range.rolling(period).mean().iloc[-1]
    return float(atr) if pd.notna(atr) else 0.0


@dataclass(slots=True)
class ScreeningCandidate:
    ts_code: str
    name: str
    ma_fitting_score: float
    ma_fitting_months: int
    ma_deviation: float
    ma_direction: str
    volume_score: float
    pe_ratio: float
    price_position: float
    per_capital_amount: float
    avg_roe: float
    total_score: float


class JoinQuantMigratedStrategy:
    """JoinQuant 策略的 Tushare 本地版适配。"""

    def __init__(
        self,
        repository: LocalDataRepository,
        config: StrategyConfig,
        signal_adapter: IntradaySignalAdapter | None = None,
    ) -> None:
        self.repository = repository
        self.config = config
        self.signal_adapter = signal_adapter or DailyApproximationAdapter()

        self.stock_pool: list[str] = []
        self.stock_scores: dict[str, float] = {}
        self.pending_buy_list: list[str] = []
        self.pending_buy_source_date: str | None = None
        self.pending_buy_executed: bool = True
        self.last_stock_screening_date: str | None = None
        self.grid_states: dict[str, dict[str, Any]] = {}
        self.breakout_states: dict[str, dict[str, Any]] = {}
        self.breakout_need_replenish: bool = False
        self.screening_records: list[dict[str, Any]] = []

    def on_open(self, engine, trade_date: pd.Timestamp) -> None:
        self.execute_pending_buy_orders(engine, trade_date)

    def on_close(self, engine, trade_date: pd.Timestamp) -> None:
        breakout_traded = self.process_breakout_reduction(engine, trade_date)
        if not breakout_traded:
            self.process_grid_trading(engine, trade_date)

    def after_close(self, engine, trade_date: pd.Timestamp) -> None:
        if self.repository.is_first_trade_day_of_month(trade_date.strftime("%Y%m%d")):
            self.execute_stock_screening(engine, trade_date, trigger="monthly_after_close")
        self.maintain_breakout_replenishment(engine, trade_date)

    def execute_stock_screening(self, engine, trade_date: pd.Timestamp, trigger: str) -> None:
        date_str = trade_date.strftime("%Y%m%d")
        if self.last_stock_screening_date == date_str:
            return
        candidates_df = self.repository.get_active_stocks(date_str)
        selected: list[ScreeningCandidate] = []
        filter_stats = {
            "candidate": len(candidates_df),
            "kcbj": 0,
            "new_stock": 0,
            "st": 0,
            "paused": 0,
            "ma": 0,
            "volume": 0,
            "pe": 0,
            "price_position": 0,
            "per_capital": 0,
            "roe": 0,
            "passed": 0,
        }

        for _, stock_row in candidates_df.iterrows():
            ts_code = str(stock_row["ts_code"])
            if self.config.filter_kcbj and self._is_kcbj(ts_code):
                filter_stats["kcbj"] += 1
                continue
            if self._is_new_stock(stock_row, trade_date):
                filter_stats["new_stock"] += 1
                continue
            if self.config.filter_st and self._is_st(ts_code, str(stock_row.get("name", "")), trade_date):
                filter_stats["st"] += 1
                continue
            latest_bar = self.repository.get_bar(ts_code, date_str)
            if latest_bar is None or float(latest_bar.get("vol") or 0) <= 0:
                filter_stats["paused"] += 1
                continue

            ma_result = self._check_ma_fitting(ts_code, trade_date)
            if not ma_result["passed"]:
                continue
            filter_stats["ma"] += 1

            volume_result = self._check_volume_breakthrough(ts_code, trade_date)
            if not volume_result["passed"]:
                continue
            filter_stats["volume"] += 1

            pe_ratio = self._get_pe_ratio(latest_bar)
            if pe_ratio <= 0 or pe_ratio >= self.config.max_pe_ratio:
                continue
            filter_stats["pe"] += 1

            price_position_result = self._check_price_position(ts_code, trade_date)
            if not price_position_result["passed"]:
                continue
            filter_stats["price_position"] += 1

            per_capital_result = self._check_per_capital_amount(ts_code, latest_bar, trade_date)
            if not per_capital_result["passed"]:
                continue
            filter_stats["per_capital"] += 1

            roe_result = self._check_continuous_roe(ts_code, trade_date)
            if not roe_result["passed"]:
                continue
            filter_stats["roe"] += 1

            total_score = float(ma_result["score"])
            filter_stats["passed"] += 1
            selected.append(
                ScreeningCandidate(
                    ts_code=ts_code,
                    name=str(stock_row.get("name", ts_code)),
                    ma_fitting_score=float(ma_result["score"]),
                    ma_fitting_months=int(ma_result["fitting_months"]),
                    ma_deviation=float(ma_result["deviation"]),
                    ma_direction=str(ma_result["direction"]),
                    volume_score=float(volume_result["score"]),
                    pe_ratio=float(pe_ratio),
                    price_position=float(price_position_result["position"]),
                    per_capital_amount=float(per_capital_result["amount"]),
                    avg_roe=float(roe_result["avg_roe"]),
                    total_score=total_score,
                )
            )

        selected.sort(key=lambda item: item.total_score, reverse=True)
        selected_count = max(self.config.display_top_n, self.config.auto_buy_stock_count)
        top_selected = selected[:selected_count]

        self.stock_pool = [item.ts_code for item in top_selected]
        self.stock_scores = {item.ts_code: item.total_score for item in top_selected}
        self.pending_buy_list = [item.ts_code for item in top_selected[: self.config.auto_buy_stock_count]]
        self.pending_buy_source_date = date_str
        self.pending_buy_executed = len(self.pending_buy_list) == 0
        self.last_stock_screening_date = date_str
        self.screening_records.append(
            {
                "trade_date": date_str,
                "trigger": trigger,
                "candidate_count": filter_stats["candidate"],
                "passed_count": filter_stats["passed"],
                "selected_codes": ",".join(item.ts_code for item in top_selected),
                "selected_names": ",".join(item.name for item in top_selected),
                "top_scores": ",".join(f"{item.total_score:.2f}" for item in top_selected),
                "details": str(filter_stats),
            }
        )

    def execute_pending_buy_orders(self, engine, trade_date: pd.Timestamp) -> None:
        if self.pending_buy_executed or not self.pending_buy_list:
            return
        date_str = trade_date.strftime("%Y%m%d")
        if self.pending_buy_source_date is None or date_str <= self.pending_buy_source_date:
            return

        remaining: list[str] = []
        held_codes = set(engine.get_holding_codes())
        for ts_code in self.pending_buy_list:
            if ts_code in held_codes:
                continue
            latest_bar = self.repository.get_bar(ts_code, date_str)
            if latest_bar is None:
                remaining.append(ts_code)
                continue
            open_price = float(latest_bar.get("open") or 0)
            if open_price <= 0 or float(latest_bar.get("vol") or 0) <= 0:
                remaining.append(ts_code)
                continue
            planned_cash = min(float(self.config.initial_position_amount), engine.portfolio.cash)
            quantity = int(planned_cash / open_price / 100) * 100
            if quantity <= 0:
                remaining.append(ts_code)
                continue
            if engine.buy(ts_code, trade_date, open_price, quantity, "次日开盘自动买入"):
                self._create_initial_grid_state(ts_code, trade_date, quantity, open_price)
            else:
                remaining.append(ts_code)
        self.pending_buy_list = remaining
        self.pending_buy_executed = len(self.pending_buy_list) == 0

    def process_grid_trading(self, engine, trade_date: pd.Timestamp) -> None:
        self._sync_grid_states_from_positions(engine, trade_date)
        date_str = trade_date.strftime("%Y%m%d")
        for ts_code in list(self.grid_states.keys()):
            position = engine.get_position(ts_code)
            if position is None or position.total_quantity <= 0:
                self.grid_states.pop(ts_code, None)
                continue
            history = self.repository.get_history(ts_code, date_str, 80, endpoint="daily")
            if history.empty:
                continue
            state = self.grid_states[ts_code]
            atr_value = _compute_atr(history, self.config.grid_atr_period)
            grid_step = atr_value * float(self.config.grid_atr_multiplier)
            if grid_step <= 0:
                continue
            state["atr_value"] = atr_value
            state["grid_step"] = grid_step
            if float(state.get("next_buy_price", 0.0)) >= float(state["base_price"]):
                state["next_buy_price"] = max(float(state["base_price"]) - grid_step, 0.0)
            current_close = float(history.iloc[-1]["close"])
            threshold = float(state["base_price"]) * float(self.config.grid_risk_control_ratio)
            state["risk_control_active"] = current_close < threshold

            if self._execute_grid_sell_for_stock(engine, trade_date, ts_code, history, state):
                continue
            self._execute_grid_buy_for_stock(engine, trade_date, ts_code, history, state)

    def process_breakout_reduction(self, engine, trade_date: pd.Timestamp) -> bool:
        self._sync_breakout_states_from_positions(engine, trade_date)
        date_str = trade_date.strftime("%Y%m%d")
        has_trade = False
        for ts_code in list(engine.get_holding_codes()):
            position = engine.get_position(ts_code)
            if position is None or position.total_quantity <= 0:
                self.breakout_states.pop(ts_code, None)
                continue
            history = self.repository.get_history(ts_code, date_str, 260, endpoint="daily")
            if history.empty:
                continue
            state = self.breakout_states.get(ts_code)
            if state is None:
                continue
            latest = history.iloc[-1]
            current_close = self.signal_adapter.get_breakout_reference_price(history)
            current_high = float(latest["high"])
            base_price = float(state["base_price"])
            doubled_threshold = base_price * float(self.config.breakout_doubled_ratio)
            if current_high >= doubled_threshold:
                state["is_doubled"] = True
                state["doubled_price"] = max(float(state.get("doubled_price", 0)), doubled_threshold)
                state["highest_price_after_doubled"] = max(
                    float(state.get("highest_price_after_doubled", 0.0)), current_high
                )
            if not state.get("is_doubled", False):
                continue

            if self._check_weekly_macd_death_cross(ts_code, trade_date):
                sellable = position.closeable_quantity(date_str)
                sold = engine.sell(ts_code, trade_date, current_close, sellable, "周线MACD死叉清仓")
                if sold > 0:
                    self._sync_grid_state_after_breakout_sell(ts_code, sold, clear_all=True, trade_date=date_str)
                    has_trade = True
                    self.breakout_need_replenish = True
                    continue

            trigger_reasons: list[str] = []
            high_volume = self._check_breakout_high_volume(history)
            if high_volume["passed"]:
                trigger_reasons.append(f"高位放量(量比={high_volume['volume_ratio']:.2f})")
            big_dark = self._check_breakout_big_dark_line(history)
            if big_dark["passed"]:
                trigger_reasons.append(f"高位大阴线(跌幅={big_dark['decline_rate'] * 100:.2f}%)")
            chip_shift = self._check_breakout_chip_shift(latest)
            if chip_shift["passed"]:
                trigger_reasons.append(f"换手率异常({chip_shift['turnover_ratio']:.2f}%)")
            if not trigger_reasons:
                continue

            quantity = int(position.total_quantity * float(self.config.breakout_reduction_ratio) / 100) * 100
            sold = engine.sell(ts_code, trade_date, current_close, quantity, "；".join(trigger_reasons))
            if sold > 0:
                self._sync_grid_state_after_breakout_sell(ts_code, sold, clear_all=False, trade_date=date_str)
                state["reduction_count"] = int(state.get("reduction_count", 0)) + 1
                has_trade = True
        return has_trade

    def maintain_breakout_replenishment(self, engine, trade_date: pd.Timestamp) -> None:
        if not self.breakout_need_replenish:
            return
        date_str = trade_date.strftime("%Y%m%d")
        if self.last_stock_screening_date == date_str:
            self.breakout_need_replenish = False
            return
        if engine.portfolio.holding_count() >= int(self.config.breakout_target_hold_count):
            self.breakout_need_replenish = False
            return
        self.execute_stock_screening(engine, trade_date, trigger="breakout_replenishment")
        self.breakout_need_replenish = False

    def _check_ma_fitting(self, ts_code: str, trade_date: pd.Timestamp) -> dict[str, Any]:
        daily = self.repository.get_daily(ts_code)
        if daily.empty:
            return {"passed": False}
        history = daily[daily["trade_date"] <= trade_date.strftime("%Y%m%d")].copy()
        if history.empty:
            return {"passed": False}
        history["trade_dt"] = pd.to_datetime(history["trade_date"], format="%Y%m%d")
        history["close"] = pd.to_numeric(history["close"], errors="coerce")
        monthly = history.set_index("trade_dt")["close"].resample("ME").last().dropna()
        if len(monthly) < max(self.config.ma_periods):
            return {"passed": False}
        ma_values = {
            period: float(monthly.tail(period).mean())
            for period in self.config.ma_periods
            if len(monthly) >= period
        }
        values = [ma_values[period] for period in sorted(self.config.ma_periods)]
        bullish = all(values[i] >= values[i + 1] for i in range(len(values) - 1))
        bearish = all(values[i] <= values[i + 1] for i in range(len(values) - 1))
        if not (bullish or bearish):
            return {"passed": False}
        deviation = float(np.std(values) / np.mean(values)) if np.mean(values) else 999.0
        if deviation > float(self.config.ma_fitting_threshold):
            return {"passed": False}
        fitting_months = 0
        closes = monthly.to_numpy()
        max_period = max(self.config.ma_periods)
        for end_idx in range(len(closes) - 1, max_period - 2, -1):
            current_values = []
            valid = True
            for period in self.config.ma_periods:
                start_idx = end_idx - period + 1
                if start_idx < 0:
                    valid = False
                    break
                current_values.append(float(np.mean(closes[start_idx : end_idx + 1])))
            if not valid:
                break
            current_bullish = all(
                current_values[i] >= current_values[i + 1] for i in range(len(current_values) - 1)
            )
            current_bearish = all(
                current_values[i] <= current_values[i + 1] for i in range(len(current_values) - 1)
            )
            if not (current_bullish or current_bearish):
                break
            current_deviation = float(np.std(current_values) / np.mean(current_values))
            if current_deviation > float(self.config.ma_fitting_threshold):
                break
            fitting_months += 1
        return {
            "passed": True,
            "score": min(100.0, fitting_months / max(self.config.ma_fitting_min_months, 1) * 100.0),
            "fitting_months": fitting_months,
            "deviation": deviation,
            "direction": "多头排列" if bullish else "空头排列",
        }

    def _check_volume_breakthrough(self, ts_code: str, trade_date: pd.Timestamp) -> dict[str, Any]:
        history = self.repository.get_history(ts_code, trade_date.strftime("%Y%m%d"), 25, endpoint="daily")
        if len(history) < 20:
            return {"passed": False, "score": 0.0}
        volumes = pd.to_numeric(history["vol"], errors="coerce").dropna()
        if len(volumes) < 20:
            return {"passed": False, "score": 0.0}
        vol_5 = float(volumes.tail(5).mean())
        vol_10 = float(volumes.tail(10).mean())
        vol_20 = float(volumes.tail(20).mean())
        passed = vol_5 > vol_10 > vol_20
        score = 0.0
        if passed and vol_10 > 0 and vol_20 > 0:
            score = min(100.0, ((vol_5 / vol_10 - 1) + (vol_10 / vol_20 - 1)) * 1000.0)
        return {"passed": passed, "score": score}

    def _check_price_position(self, ts_code: str, trade_date: pd.Timestamp) -> dict[str, Any]:
        joined = self.repository.join_price_with_factor(ts_code)
        history = joined[joined["trade_date"] <= trade_date.strftime("%Y%m%d")].copy()
        if len(history) < 60:
            return {"passed": False, "position": 0.0}
        current_price = float(history.iloc[-1]["close_adj"])
        all_time_high = float(pd.to_numeric(history["high_adj"], errors="coerce").max())
        if current_price <= 0 or all_time_high <= 0:
            return {"passed": False, "position": 0.0}
        position = current_price / all_time_high
        return {"passed": position <= float(self.config.price_position_threshold), "position": position}

    def _check_per_capital_amount(self, ts_code: str, latest_bar: dict[str, Any], trade_date: pd.Timestamp) -> dict[str, Any]:
        circ_mv = pd.to_numeric(pd.Series([latest_bar.get("circ_mv")]), errors="coerce").iloc[0]
        if pd.isna(circ_mv) or float(circ_mv) <= 0:
            return {"passed": False, "amount": 0.0}
        holder_frame = self.repository.get_holdernumber(ts_code)
        if holder_frame.empty:
            return {"passed": True, "amount": 0.0, "skipped": True}
        cutoff = trade_date.strftime("%Y%m%d")
        candidates = holder_frame[
            (holder_frame["ann_date"] != "") & (holder_frame["ann_date"] <= cutoff)
        ].copy()
        if candidates.empty:
            candidates = holder_frame[
                (holder_frame["end_date"] != "") & (holder_frame["end_date"] <= cutoff)
            ].copy()
        if candidates.empty:
            return {"passed": True, "amount": 0.0, "skipped": True}
        latest = candidates.sort_values(["ann_date", "end_date"]).iloc[-1]
        holder_num = pd.to_numeric(pd.Series([latest.get("holder_num")]), errors="coerce").iloc[0]
        if pd.isna(holder_num) or float(holder_num) <= 0:
            return {"passed": True, "amount": 0.0, "skipped": True}
        amount = float(circ_mv) * 10000.0 / float(holder_num)
        return {"passed": amount > float(self.config.min_per_capital_amount), "amount": amount}

    def _check_continuous_roe(self, ts_code: str, trade_date: pd.Timestamp) -> dict[str, Any]:
        frame = self.repository.get_fina_indicator(ts_code)
        if frame.empty:
            return {"passed": False, "avg_roe": 0.0}
        current_year = trade_date.year
        latest_annual_year = current_year - 2 if trade_date.month <= 4 else current_year - 1
        required_years = [latest_annual_year - offset for offset in range(self.config.roe_years)]
        annual_rows = frame[frame["end_date"].str.endswith("1231")].copy()
        annual_rows = annual_rows.drop_duplicates(subset=["end_date"], keep="last")
        values: list[float] = []
        for year in required_years:
            row = annual_rows[annual_rows["end_date"] == f"{year}1231"]
            if row.empty:
                return {"passed": False, "avg_roe": 0.0}
            roe_value = pd.to_numeric(row.iloc[-1]["roe"], errors="coerce")
            if pd.isna(roe_value) or float(roe_value) <= float(self.config.min_roe) * 100.0:
                return {"passed": False, "avg_roe": 0.0}
            values.append(float(roe_value) / 100.0)
        return {"passed": True, "avg_roe": float(np.mean(values))}

    def _get_pe_ratio(self, latest_bar: dict[str, Any]) -> float:
        pe_ttm = pd.to_numeric(pd.Series([latest_bar.get("pe_ttm")]), errors="coerce").iloc[0]
        if pd.notna(pe_ttm) and float(pe_ttm) > 0:
            return float(pe_ttm)
        pe = pd.to_numeric(pd.Series([latest_bar.get("pe")]), errors="coerce").iloc[0]
        return float(pe) if pd.notna(pe) else 0.0

    def _create_initial_grid_state(
        self, ts_code: str, trade_date: pd.Timestamp, quantity: int, price: float
    ) -> None:
        self.grid_states[ts_code] = {
            "base_price": float(price),
            "avg_cost_price": float(price),
            "atr_value": 0.0,
            "grid_step": 0.0,
            "next_buy_price": float(price),
            "risk_control_active": False,
            "lots": [
                {
                    "quantity": int(quantity),
                    "buy_price": float(price),
                    "trade_date": trade_date.strftime("%Y%m%d"),
                }
            ],
        }
        self.breakout_states[ts_code] = {
            "base_price": float(price),
            "is_doubled": False,
            "doubled_price": 0.0,
            "highest_price_after_doubled": 0.0,
            "reduction_count": 0,
        }

    def _sync_grid_states_from_positions(self, engine, trade_date: pd.Timestamp) -> None:
        date_str = trade_date.strftime("%Y%m%d")
        active_codes = set(engine.get_holding_codes())
        for ts_code in active_codes:
            position = engine.get_position(ts_code)
            if position is None:
                continue
            state = self.grid_states.setdefault(
                ts_code,
                {
                    "base_price": position.avg_cost,
                    "avg_cost_price": position.avg_cost,
                    "atr_value": 0.0,
                    "grid_step": 0.0,
                    "next_buy_price": position.avg_cost,
                    "risk_control_active": False,
                    "lots": [],
                },
            )
            state["avg_cost_price"] = position.avg_cost
            state["lots"] = [
                {"quantity": lot.quantity, "buy_price": lot.buy_price, "trade_date": lot.trade_date}
                for lot in position.lots
            ]
            if state["grid_step"] > 0 and state["next_buy_price"] <= 0:
                state["next_buy_price"] = max(position.avg_cost - state["grid_step"], 0.0)
            elif state["grid_step"] <= 0:
                state["next_buy_price"] = position.avg_cost
        for ts_code in list(self.grid_states.keys()):
            if ts_code not in active_codes:
                self.grid_states.pop(ts_code, None)

    def _sync_breakout_states_from_positions(self, engine, trade_date: pd.Timestamp) -> None:
        active_codes = set(engine.get_holding_codes())
        for ts_code in active_codes:
            position = engine.get_position(ts_code)
            if position is None:
                continue
            if ts_code not in self.breakout_states:
                base_price = self.grid_states.get(ts_code, {}).get("base_price", position.avg_cost)
                self.breakout_states[ts_code] = {
                    "base_price": float(base_price),
                    "is_doubled": False,
                    "doubled_price": 0.0,
                    "highest_price_after_doubled": 0.0,
                    "reduction_count": 0,
                }
        for ts_code in list(self.breakout_states.keys()):
            if ts_code not in active_codes:
                self.breakout_states.pop(ts_code, None)

    def _execute_grid_buy_for_stock(
        self, engine, trade_date: pd.Timestamp, ts_code: str, history: pd.DataFrame, state: dict[str, Any]
    ) -> bool:
        if state["risk_control_active"]:
            return False
        golden, _ = _macd_cross(pd.to_numeric(history["close"], errors="coerce"))
        if not golden:
            return False
        triggered, fill_price = self.signal_adapter.get_grid_buy_fill(history, float(state["next_buy_price"]))
        if not triggered or fill_price is None:
            return False
        planned_cash = min(float(self.config.grid_trade_amount), engine.portfolio.cash)
        quantity = int(planned_cash / fill_price / 100) * 100
        if quantity <= 0:
            return False
        if engine.buy(ts_code, trade_date, fill_price, quantity, "日线近似网格买入"):
            state["lots"].append(
                {
                    "quantity": int(quantity),
                    "buy_price": float(fill_price),
                    "trade_date": trade_date.strftime("%Y%m%d"),
                }
            )
            state["next_buy_price"] = max(float(fill_price) - float(state["grid_step"]), 0.0)
            return True
        return False

    def _execute_grid_sell_for_stock(
        self, engine, trade_date: pd.Timestamp, ts_code: str, history: pd.DataFrame, state: dict[str, Any]
    ) -> bool:
        position = engine.get_position(ts_code)
        if position is None:
            return False
        date_str = trade_date.strftime("%Y%m%d")
        closeable_lots = [lot for lot in position.lots if lot.trade_date < date_str]
        if not closeable_lots:
            return False
        latest_lot = closeable_lots[-1]
        trigger_price = float(latest_lot.buy_price) * float(self.config.grid_sell_profit_ratio)
        _, death = _macd_cross(pd.to_numeric(history["close"], errors="coerce"))
        if not death:
            return False
        triggered, fill_price = self.signal_adapter.get_grid_sell_fill(history, trigger_price)
        if not triggered or fill_price is None:
            return False
        sold = engine.sell(ts_code, trade_date, fill_price, latest_lot.quantity, "日线近似网格卖出")
        if sold <= 0:
            return False
        self._sync_grid_state_after_breakout_sell(ts_code, sold, clear_all=False, trade_date=date_str)
        state["next_buy_price"] = max(float(fill_price) - float(state["grid_step"]), 0.0)
        return True

    def _sync_grid_state_after_breakout_sell(
        self, ts_code: str, sell_quantity: int, clear_all: bool, trade_date: str
    ) -> None:
        state = self.grid_states.get(ts_code)
        if state is None:
            return
        if clear_all:
            self.grid_states.pop(ts_code, None)
            return
        remaining = sell_quantity
        for lot in reversed(state["lots"]):
            if remaining <= 0:
                break
            if lot["trade_date"] >= trade_date:
                continue
            take = min(int(lot["quantity"]), remaining)
            lot["quantity"] -= take
            remaining -= take
        state["lots"] = [lot for lot in state["lots"] if int(lot["quantity"]) > 0]

    def _check_breakout_high_volume(self, history: pd.DataFrame) -> dict[str, Any]:
        if len(history) < 6:
            return {"passed": False, "volume_ratio": 0.0}
        latest_volume = float(pd.to_numeric(history.iloc[-1]["vol"], errors="coerce"))
        prev_avg = float(pd.to_numeric(history.iloc[-6:-1]["vol"], errors="coerce").mean())
        if latest_volume <= 0 or prev_avg <= 0:
            return {"passed": False, "volume_ratio": 0.0}
        ratio = latest_volume / prev_avg
        return {"passed": ratio > float(self.config.breakout_volume_threshold), "volume_ratio": ratio}

    def _check_breakout_big_dark_line(self, history: pd.DataFrame) -> dict[str, Any]:
        if len(history) < 6:
            return {"passed": False, "decline_rate": 0.0}
        closes = pd.to_numeric(history["close"], errors="coerce").tail(6)
        prev_close = float(closes.iloc[-2])
        current_close = float(closes.iloc[-1])
        ma3_yesterday = float(closes.iloc[-4:-1].mean())
        ma5_yesterday = float(closes.iloc[-6:-1].mean())
        ma3_today = float(closes.iloc[-3:].mean())
        ma5_today = float(closes.iloc[-5:].mean())
        day_open = float(pd.to_numeric(pd.Series([history.iloc[-1]["open"]]), errors="coerce").iloc[0])
        decline_rate = (current_close - prev_close) / prev_close if prev_close > 0 else 0.0
        crossed = ma3_yesterday >= ma5_yesterday and ma3_today < ma5_today
        passed = crossed and decline_rate <= -float(self.config.breakout_decline_threshold) and current_close < day_open
        return {"passed": passed, "decline_rate": decline_rate}

    def _check_breakout_chip_shift(self, latest_row: pd.Series) -> dict[str, Any]:
        turnover = pd.to_numeric(pd.Series([latest_row.get("turnover_rate")]), errors="coerce").iloc[0]
        turnover = 0.0 if pd.isna(turnover) else float(turnover)
        return {"passed": turnover > float(self.config.breakout_turnover_threshold), "turnover_ratio": turnover}

    def _check_weekly_macd_death_cross(self, ts_code: str, trade_date: pd.Timestamp) -> bool:
        daily = self.repository.get_daily(ts_code)
        history = daily[daily["trade_date"] <= trade_date.strftime("%Y%m%d")].copy()
        if len(history) < 35:
            return False
        history["trade_dt"] = pd.to_datetime(history["trade_date"], format="%Y%m%d")
        history["close"] = pd.to_numeric(history["close"], errors="coerce")
        weekly = history.set_index("trade_dt")["close"].resample("W-FRI").last().dropna()
        _, death = _macd_cross(weekly)
        return death

    def _is_kcbj(self, ts_code: str) -> bool:
        symbol = ts_code.split(".")[0]
        return symbol.startswith("688") or ts_code.endswith(".BJ") or symbol.startswith("4") or symbol.startswith("8")

    def _is_new_stock(self, stock_row: pd.Series, trade_date: pd.Timestamp) -> bool:
        list_date = pd.to_datetime(str(stock_row["list_date"]), format="%Y%m%d", errors="coerce")
        if pd.isna(list_date):
            return True
        return list_date > trade_date - timedelta(days=int(self.config.filter_new_stock_days))

    def _is_st(self, ts_code: str, current_name: str, trade_date: pd.Timestamp) -> bool:
        if self.config.use_namechange_for_st_filter:
            frame = self.repository.get_namechange(ts_code)
            if not frame.empty:
                target = trade_date.strftime("%Y%m%d")
                for _, row in frame.iterrows():
                    start_date = str(row.get("start_date") or "")
                    end_date = str(row.get("end_date") or "")
                    if start_date and start_date > target:
                        continue
                    if end_date and end_date < target:
                        continue
                    name = str(row.get("name") or "")
                    if "ST" in name.upper():
                        return True
        return "ST" in current_name.upper()
