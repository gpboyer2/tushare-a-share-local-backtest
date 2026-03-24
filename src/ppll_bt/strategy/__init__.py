"""
@fileoverview
策略层导出模块，负责对外暴露当前默认策略实现。

主要职责：
- 对外暴露：模块级常量、类型或默认导出。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 统一导出当前默认策略实现。
- 简化上层装配策略时的导入路径。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from .joinquant_migrated import JoinQuantMigratedStrategy

__all__ = ["JoinQuantMigratedStrategy"]
