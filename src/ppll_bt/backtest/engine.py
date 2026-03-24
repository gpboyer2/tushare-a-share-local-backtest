"""
@fileoverview
本地回测执行引擎，负责按交易日推进、驱动策略钩子并汇总回测结果。

主要职责：
- 对外暴露：BacktestResult、PortfolioState、LocalBacktestEngine。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 围绕交易日历推进回测主循环。
- 在盘前、盘中、盘后时点调用策略钩子。
- 维护组合状态、成交记录、净值曲线并最终输出 `BacktestResult`。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from ppll_bt.backtest.models import DailyEquityRecord, Position, PositionLot, TradeRecord
from ppll_bt.config import BacktestSettings
from ppll_bt.data.repository import LocalDataRepository


@dataclass(slots=True)
class BacktestResult:
    summary: dict[str, Any]
    equity_curve: pd.DataFrame
    trades: pd.DataFrame
    screenings: pd.DataFrame


@dataclass(slots=True)
class PortfolioState:
    cash: float
    positions: dict[str, Position] = field(default_factory=dict)
    trades: list[TradeRecord] = field(default_factory=list)
    equity_records: list[DailyEquityRecord] = field(default_factory=list)

    def holding_count(self) -> int:
        return sum(1 for position in self.positions.values() if position.total_quantity > 0)


class LocalBacktestEngine:
    """负责日期推进、撮合、账户状态和统计汇总。"""

    def __init__(
        self,
        settings: BacktestSettings,
        repository: LocalDataRepository,
        strategy: Any,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.strategy = strategy
        self.portfolio = PortfolioState(cash=float(settings.backtest.initial_cash))
        self.trade_dates = repository.get_trade_calendar(
            settings.backtest.start_date, settings.backtest.end_date
        )
        self.current_date: pd.Timestamp | None = None

    def run(self) -> BacktestResult:
        total = len(self.trade_dates)
        started_at = time.perf_counter()
        self._print_progress("start", 0, total, None, started_at)
        for index, trade_date in enumerate(self.trade_dates, start=1):
            self.current_date = trade_date
            self.strategy.on_open(self, trade_date)
            self.strategy.on_close(self, trade_date)
            self.strategy.after_close(self, trade_date)
            self._mark_to_market(trade_date)
            if self._should_log_progress(index, total):
                self._print_progress("running", index, total, trade_date, started_at)

        equity_curve = pd.DataFrame([asdict(record) for record in self.portfolio.equity_records])
        trades = pd.DataFrame([asdict(record) for record in self.portfolio.trades])
        screenings = pd.DataFrame(self.strategy.screening_records)
        summary = self._build_summary(equity_curve, trades)
        self._print_progress("done", total, total, self.trade_dates[-1] if self.trade_dates else None, started_at)
        return BacktestResult(summary=summary, equity_curve=equity_curve, trades=trades, screenings=screenings)

    def buy(self, ts_code: str, trade_date: pd.Timestamp, price: float, quantity: int, reason: str) -> bool:
        quantity = int(quantity / 100) * 100
        if quantity <= 0 or price <= 0:
            return False
        amount = price * quantity
        commission = max(self.settings.backtest.min_commission, amount * self.settings.backtest.commission_rate)
        total_cost = amount + commission
        if total_cost > self.portfolio.cash:
            return False
        self.portfolio.cash -= total_cost
        position = self.portfolio.positions.setdefault(ts_code, Position(ts_code=ts_code))
        position.add_lot(
            PositionLot(
                quantity=quantity,
                buy_price=price,
                trade_date=trade_date.strftime("%Y%m%d"),
                source=reason,
            )
        )
        self.portfolio.trades.append(
            TradeRecord(
                trade_date=trade_date.strftime("%Y%m%d"),
                ts_code=ts_code,
                side="BUY",
                price=price,
                quantity=quantity,
                amount=amount,
                fee=commission,
                cash_after=self.portfolio.cash,
                reason=reason,
            )
        )
        return True

    def sell(self, ts_code: str, trade_date: pd.Timestamp, price: float, quantity: int, reason: str) -> int:
        position = self.portfolio.positions.get(ts_code)
        if position is None:
            return 0
        closeable = position.closeable_quantity(trade_date.strftime("%Y%m%d"))
        sellable = min(int(quantity / 100) * 100, closeable)
        if sellable <= 0 or price <= 0:
            return 0
        sold = position.reduce_lifo(sellable, trade_date.strftime("%Y%m%d"))
        if sold <= 0:
            return 0
        amount = price * sold
        commission = max(self.settings.backtest.min_commission, amount * self.settings.backtest.commission_rate)
        tax = amount * self.settings.backtest.tax_rate
        self.portfolio.cash += amount - commission - tax
        self.portfolio.trades.append(
            TradeRecord(
                trade_date=trade_date.strftime("%Y%m%d"),
                ts_code=ts_code,
                side="SELL",
                price=price,
                quantity=sold,
                amount=amount,
                fee=commission + tax,
                cash_after=self.portfolio.cash,
                reason=reason,
            )
        )
        if position.total_quantity <= 0:
            self.portfolio.positions.pop(ts_code, None)
        return sold

    def get_position(self, ts_code: str) -> Position | None:
        return self.portfolio.positions.get(ts_code)

    def get_holding_codes(self) -> list[str]:
        return sorted(self.portfolio.positions.keys())

    def get_latest_bar(self, ts_code: str, trade_date: pd.Timestamp) -> dict | None:
        return self.repository.get_bar(ts_code, trade_date.strftime("%Y%m%d"))

    def get_prev_trade_date(self, trade_date: pd.Timestamp) -> pd.Timestamp | None:
        return self.repository.get_previous_trade_date(trade_date.strftime("%Y%m%d"))

    def get_next_trade_date(self, trade_date: pd.Timestamp) -> pd.Timestamp | None:
        return self.repository.get_next_trade_date(trade_date.strftime("%Y%m%d"))

    def export(self, result: BacktestResult, output_dir: str | Path) -> None:
        target = Path(output_dir)
        target.mkdir(parents=True, exist_ok=True)
        result.equity_curve.to_csv(target / "equity_curve.csv", index=False, encoding="utf-8")
        result.trades.to_csv(target / "trades.csv", index=False, encoding="utf-8")
        result.screenings.to_csv(target / "screenings.csv", index=False, encoding="utf-8")
        with (target / "summary.json").open("w", encoding="utf-8") as file:
            json.dump(result.summary, file, ensure_ascii=False, indent=2)

    def _mark_to_market(self, trade_date: pd.Timestamp) -> None:
        market_value = 0.0
        for ts_code, position in self.portfolio.positions.items():
            bar = self.repository.get_latest_bar_on_or_before(ts_code, trade_date.strftime("%Y%m%d"))
            if not bar:
                continue
            close_price = float(bar.get("close") or 0)
            market_value += close_price * position.total_quantity
        total_equity = self.portfolio.cash + market_value
        self.portfolio.equity_records.append(
            DailyEquityRecord(
                trade_date=trade_date.strftime("%Y%m%d"),
                cash=self.portfolio.cash,
                market_value=market_value,
                total_equity=total_equity,
            )
        )

    def _build_summary(self, equity_curve: pd.DataFrame, trades: pd.DataFrame) -> dict[str, Any]:
        if equity_curve.empty:
            return {"status": "empty"}
        equity_curve = equity_curve.copy()
        equity_curve["daily_return"] = equity_curve["total_equity"].pct_change().fillna(0.0)
        equity_curve["cummax"] = equity_curve["total_equity"].cummax()
        equity_curve["drawdown"] = equity_curve["total_equity"] / equity_curve["cummax"] - 1.0
        start_value = float(equity_curve.iloc[0]["total_equity"])
        end_value = float(equity_curve.iloc[-1]["total_equity"])
        total_return = end_value / start_value - 1.0 if start_value > 0 else 0.0
        years = max(len(equity_curve) / 252.0, 1 / 252.0)
        annual_return = (1 + total_return) ** (1 / years) - 1 if start_value > 0 else 0.0
        return {
            "start_date": str(equity_curve.iloc[0]["trade_date"]),
            "end_date": str(equity_curve.iloc[-1]["trade_date"]),
            "start_value": start_value,
            "end_value": end_value,
            "total_return": total_return,
            "annual_return": annual_return,
            "max_drawdown": float(equity_curve["drawdown"].min()),
            "trade_count": int(len(trades)),
            "buy_count": int((trades["side"] == "BUY").sum()) if not trades.empty else 0,
            "sell_count": int((trades["side"] == "SELL").sum()) if not trades.empty else 0,
            "holding_count": self.portfolio.holding_count(),
        }

    def _should_log_progress(self, index: int, total: int) -> bool:
        interval = max(int(self.settings.backtest.progress_log_interval), 1)
        return index == total or index == 1 or index % interval == 0

    def _print_progress(
        self,
        phase: str,
        index: int,
        total: int,
        trade_date: pd.Timestamp | None,
        started_at: float,
    ) -> None:
        elapsed = time.perf_counter() - started_at
        date_text = "-" if trade_date is None else trade_date.strftime("%Y%m%d")
        latest_equity = (
            self.portfolio.equity_records[-1].total_equity if self.portfolio.equity_records else self.portfolio.cash
        )
        print(
            "[progress] "
            f"phase={phase} "
            f"step={index}/{total} "
            f"trade_date={date_text} "
            f"holdings={self.portfolio.holding_count()} "
            f"cash={self.portfolio.cash:.2f} "
            f"equity={latest_equity:.2f} "
            f"elapsed={elapsed:.1f}s",
            flush=True,
        )
