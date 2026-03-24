"""
@fileoverview
回测框架顶层包导出模块，负责暴露配置加载和基础对外入口。

主要职责：
- 对外暴露：模块级常量、类型或默认导出。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 导出项目对外常用入口。
- 保持包级引用路径稳定，减少上层调用方的导入复杂度。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from .config import BacktestSettings, load_settings

__all__ = ["BacktestSettings", "load_settings"]
