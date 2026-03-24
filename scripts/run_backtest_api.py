"""
@fileoverview
面向 Web/HTTP 调用的回测桥接脚本，负责把 Python 回测结果转换成 JSON 结构。

主要职责：
- 对外暴露：_normalize_value、_frame_to_records、main。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 作为 Web 后端调用的 Python 入口运行完整回测。
- 把 DataFrame、数值和日期结果归一化成 JSON 可序列化结构。
- 供 Node 服务层通过子进程桥接调用。

使用方式：
- 命令行入口：`./.venv/bin/python scripts/run_backtest_api.py ...`。
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.backtest import LocalBacktestEngine
from ppll_bt.config import load_settings
from ppll_bt.data import LocalDataRepository
from ppll_bt.strategy import JoinQuantMigratedStrategy


def _normalize_value(value: Any) -> Any:
    if is_dataclass(value):
        return _normalize_value(asdict(value))
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _normalize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize_value(item) for item in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return str(value)
    if value != value:  # NaN
        return None
    return value


def _frame_to_records(frame) -> list[dict[str, Any]]:
    if frame is None or frame.empty:
        return []
    normalized = frame.where(frame.notna(), None).to_dict(orient="records")
    return [_normalize_value(row) for row in normalized]


def main() -> None:
    parser = argparse.ArgumentParser(description="为 Web API 运行本地回测并输出 JSON")
    parser.add_argument("--config", required=True, help="配置文件路径")
    parser.add_argument("--result-json", required=True, help="输出结果 JSON 文件")
    parser.add_argument("--run-id", default="", help="可选的外部指定运行 ID")
    args = parser.parse_args()

    settings = load_settings(args.config)
    repository = LocalDataRepository(settings.data_dir)
    strategy = JoinQuantMigratedStrategy(repository, settings.strategy)
    engine = LocalBacktestEngine(settings, repository, strategy)
    result = engine.run()

    run_id = args.run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = settings.output_dir / run_id
    engine.export(result, output_dir)

    payload = {
        "run_id": run_id,
        "output_dir": str(output_dir),
        "summary": _normalize_value(result.summary),
        "equity_curve": _frame_to_records(result.equity_curve),
        "trades": _frame_to_records(result.trades),
        "screenings": _frame_to_records(result.screenings),
    }

    with (output_dir / "result.json").open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)

    target = Path(args.result_json).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)

    print(json.dumps({"status": "ok", "run_id": run_id, "result_json": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
