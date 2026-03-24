"""
@fileoverview
数据全量校验脚本。

主要职责：
- 第一步，读取配置文件，确定同步窗口和目标数据库。
- 第二步，调用 `ppll_bt.data.validation` 执行真正的全库校验。
- 第三步，把结果写成 JSON 报告，并在终端打印摘要。

怎么用：
- 命令行入口：`./.venv/bin/python scripts/validate_data_completeness.py --config ... --db ... --report ...`
- 退出码 `0` 表示校验通过。
- 退出码 `1` 表示存在 failure，需要继续修数据或修同步链路。

主要看什么：
- `status`
- `summary.failure_count`
- `summary.warning_count`
- `failures`
- `warnings`
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.config import load_settings
from ppll_bt.data.validation import validate_database_completeness


def resolve_report_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def print_summary(report: dict[str, object]) -> None:
    summary = report["summary"]
    if not isinstance(summary, dict):
        return
    print(f"[validate] status={report['status']}", flush=True)
    print(f"[validate] database={report['database_path']}", flush=True)
    print(
        "[validate] stock_count={stock_count} failures={failure_count} warnings={warning_count}".format(
            stock_count=summary.get("stock_count", 0),
            failure_count=summary.get("failure_count", 0),
            warning_count=summary.get("warning_count", 0),
        ),
        flush=True,
    )
    for issue in report.get("failures", [])[:10]:
        print(f"[failure] {issue['code']} {issue['message']}", flush=True)
    for issue in report.get("warnings", [])[:10]:
        print(f"[warning] {issue['code']} {issue['message']}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="校验 SQLite 历史数据是否完整覆盖回测所需接口。")
    parser.add_argument(
        "--config",
        default=str(PROJECT_ROOT / "config" / "backtest.fullsync.json"),
        help="配置文件路径，用于解析 data_sync 窗口和默认数据库路径。",
    )
    parser.add_argument(
        "--db",
        default="",
        help="显式指定 SQLite 路径；为空时使用配置里的 data_dir。",
    )
    parser.add_argument(
        "--report",
        default=str(PROJECT_ROOT / "outputs" / "data_completeness_report.json"),
        help="校验报告输出路径。",
    )
    parser.add_argument(
        "--check-namechange",
        action="store_true",
        help="同时校验可选的 namechange 表。",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=20,
        help="每类失败项写入报告的样本上限。",
    )
    args = parser.parse_args()

    settings = load_settings(args.config)
    db_path = Path(args.db).expanduser().resolve() if args.db else settings.data_dir.resolve()
    report = validate_database_completeness(
        db_path=db_path,
        sync_start_date=settings.data_sync.start_date,
        sync_end_date=settings.data_sync.end_date,
        check_namechange=args.check_namechange,
        sample_limit=args.sample_limit,
    )

    report_path = resolve_report_path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print_summary(report)
    print(f"[report] {report_path}", flush=True)
    return 0 if report["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
