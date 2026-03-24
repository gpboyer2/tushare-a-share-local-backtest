"""
@fileoverview
回测执行子包导出模块，负责统一暴露回测相关核心对象。

主要职责：
- 对外暴露：模块级常量、类型或默认导出。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 聚合回测子包的公共导出。
- 为上层模块提供统一导入入口。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from .engine import LocalBacktestEngine

__all__ = ["LocalBacktestEngine"]
