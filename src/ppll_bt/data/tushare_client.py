"""
@fileoverview
Tushare 客户端工厂模块，负责根据项目配置和环境变量创建 API 客户端。

主要职责：
- 对外暴露：TushareClientFactory。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 从设置对象和环境变量中解析 Tushare Token。
- 集中创建并返回项目使用的 Pro API 客户端。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

import os

import tushare as ts

from ppll_bt.config import BacktestSettings


class TushareClientFactory:
    """统一管理 Tushare Pro 客户端创建。"""

    def __init__(self, settings: BacktestSettings) -> None:
        self.settings = settings

    def create(self):
        token = os.getenv(self.settings.tushare_token_env, "").strip()
        if not token:
            raise RuntimeError(
                f"环境变量 {self.settings.tushare_token_env} 未设置，无法访问 Tushare。"
            )
        ts.set_token(token)
        return ts.pro_api(token)
