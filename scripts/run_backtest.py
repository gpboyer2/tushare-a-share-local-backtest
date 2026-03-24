"""
@fileoverview
本地回测命令行入口，负责装配配置、数据仓库、策略和回测引擎并输出结果文件。

主要职责：
- 对外暴露：main。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 解析命令行参数并读取回测配置。
- 创建 `LocalDataRepository`、策略实例和 `LocalBacktestEngine`。
- 执行回测后把 summary、equity_curve、trades、screenings 写入输出目录。

使用方式：
- 命令行入口：`./.venv/bin/python scripts/run_backtest.py ...`。
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.backtest import LocalBacktestEngine
from ppll_bt.config import load_settings
from ppll_bt.data import LocalDataRepository
from ppll_bt.strategy import JoinQuantMigratedStrategy


def main() -> None:
    parser = argparse.ArgumentParser(description="运行 JoinQuant 策略的 Tushare 本地回测")
    parser.add_argument(
        "--config",
        default=str(PROJECT_ROOT / "config" / "backtest.json"),
        help="配置文件路径",
    )
    args = parser.parse_args()

    settings = load_settings(args.config)
    repository = LocalDataRepository(settings.data_dir)
    strategy = JoinQuantMigratedStrategy(repository, settings.strategy)
    engine = LocalBacktestEngine(settings, repository, strategy)
    result = engine.run()

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = settings.output_dir / run_id
    engine.export(result, output_dir)
    print(f"[summary] {result.summary}")
    print(f"[output] {output_dir}")


if __name__ == "__main__":
    main()
