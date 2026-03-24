"""
@fileoverview
回测领域模型定义模块，负责持仓、成交、净值等核心数据结构。

主要职责：
- 对外暴露：PositionLot、Position、TradeRecord、DailyEquityRecord。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 使用数据类描述持仓批次、整体持仓、成交记录和日度净值。
- 为引擎、策略和输出逻辑提供统一的数据结构约定。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class PositionLot:
    quantity: int
    buy_price: float
    trade_date: str
    source: str


@dataclass(slots=True)
class Position:
    ts_code: str
    lots: list[PositionLot] = field(default_factory=list)

    @property
    def total_quantity(self) -> int:
        return sum(lot.quantity for lot in self.lots)

    @property
    def avg_cost(self) -> float:
        total_qty = self.total_quantity
        if total_qty <= 0:
            return 0.0
        total_cost = sum(lot.buy_price * lot.quantity for lot in self.lots)
        return total_cost / total_qty

    def closeable_quantity(self, trade_date: str) -> int:
        return sum(lot.quantity for lot in self.lots if lot.trade_date < trade_date)

    def add_lot(self, lot: PositionLot) -> None:
        self.lots.append(lot)

    def reduce_lifo(self, quantity: int, trade_date: str) -> int:
        remaining = quantity
        sold = 0
        for lot in reversed(self.lots):
            if remaining <= 0:
                break
            if lot.trade_date >= trade_date or lot.quantity <= 0:
                continue
            take = min(lot.quantity, remaining)
            lot.quantity -= take
            remaining -= take
            sold += take
        self.lots = [lot for lot in self.lots if lot.quantity > 0]
        return sold


@dataclass(slots=True)
class TradeRecord:
    trade_date: str
    ts_code: str
    side: str
    price: float
    quantity: int
    amount: float
    fee: float
    cash_after: float
    reason: str


@dataclass(slots=True)
class DailyEquityRecord:
    trade_date: str
    cash: float
    market_value: float
    total_equity: float
