"""
@fileoverview
分钟级扩展适配模块，负责为未来分钟级信号和日线近似之间预留适配层。

主要职责：
- 对外暴露：IntradaySignalAdapter、DailyApproximationAdapter。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 为未来分钟级信号扩展预留适配接口。
- 定义分钟信号与当前日线近似逻辑之间的桥接方式。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd


class IntradaySignalAdapter(ABC):
    """分钟逻辑扩展接口。

    当前版本用日线近似实现；未来有分钟权限后，只需要替换这个适配器，
    策略层和回测执行层不需要重写。
    """

    mode: str = "daily"

    @abstractmethod
    def get_grid_buy_fill(self, history: pd.DataFrame, next_buy_price: float) -> tuple[bool, float | None]:
        raise NotImplementedError

    @abstractmethod
    def get_grid_sell_fill(self, history: pd.DataFrame, trigger_price: float) -> tuple[bool, float | None]:
        raise NotImplementedError

    @abstractmethod
    def get_breakout_reference_price(self, history: pd.DataFrame) -> float:
        raise NotImplementedError


class DailyApproximationAdapter(IntradaySignalAdapter):
    mode = "daily"

    def get_grid_buy_fill(self, history: pd.DataFrame, next_buy_price: float) -> tuple[bool, float | None]:
        latest = history.iloc[-1]
        day_low = float(latest["low"])
        day_open = float(latest["open"])
        if day_low > next_buy_price:
            return False, None
        return True, day_open if day_open <= next_buy_price else next_buy_price

    def get_grid_sell_fill(self, history: pd.DataFrame, trigger_price: float) -> tuple[bool, float | None]:
        latest = history.iloc[-1]
        day_high = float(latest["high"])
        day_open = float(latest["open"])
        if day_high < trigger_price:
            return False, None
        return True, day_open if day_open >= trigger_price else trigger_price

    def get_breakout_reference_price(self, history: pd.DataFrame) -> float:
        return float(history.iloc[-1]["close"])
