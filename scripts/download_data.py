"""
@fileoverview
Tushare 数据下载命令行入口，负责把参考数据、市场数据和基础面数据同步到本地 SQLite。

主要职责：
- 对外暴露：enable_line_buffering、clone_sqlite_database、main。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 解析命令行参数并读取同步配置。
- 支持工作库、种子库、正式库发布和同步报告输出。
- 调用 `TushareDataSyncer` 执行下载，并在需要时备份或发布 SQLite 库。

使用方式：
- 命令行入口：`./.venv/bin/python scripts/download_data.py ...`。
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.config import load_settings
from ppll_bt.data import LocalDataRepository, TushareDataSyncer


def enable_line_buffering() -> None:
    for stream_name in ["stdout", "stderr"]:
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(line_buffering=True)


def clone_sqlite_database(source_path: Path, target_path: Path) -> None:
    source = sqlite3.connect(source_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists():
        target_path.unlink()
    destination = sqlite3.connect(target_path)
    try:
        source.backup(destination)
        destination.commit()
    finally:
        destination.close()
        source.close()


def main() -> None:
    enable_line_buffering()
    parser = argparse.ArgumentParser(description="下载 Tushare 本地回测所需数据")
    parser.add_argument(
        "--config",
        default=str(PROJECT_ROOT / "config" / "backtest.json"),
        help="配置文件路径",
    )
    parser.add_argument("--limit", type=int, default=None, help="仅同步前 N 只股票，便于快速试跑")
    parser.add_argument(
        "--report",
        default=str(PROJECT_ROOT / "outputs" / "data_sync_report.json"),
        help="同步报告输出路径",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="跳过同步前的 SQLite 备份",
    )
    parser.add_argument(
        "--working-db",
        default="",
        help="可选的工作 SQLite 路径，会覆盖配置里的 data_dir",
    )
    parser.add_argument(
        "--seed-db",
        default="",
        help="工作库为空时，用这个 SQLite 备份作为初始种子",
    )
    parser.add_argument(
        "--final-db",
        default="",
        help="同步成功后，把当前工作库发布到这个正式 SQLite 路径",
    )
    args = parser.parse_args()

    settings = load_settings(args.config)
    working_db = Path(args.working_db).expanduser().resolve() if args.working_db else settings.data_dir
    seed_db = Path(args.seed_db).expanduser().resolve() if args.seed_db else None
    final_db = Path(args.final_db).expanduser().resolve() if args.final_db else None
    if seed_db and seed_db.exists() and (not working_db.exists() or working_db.stat().st_size == 0):
        clone_sqlite_database(seed_db, working_db)
        print(f"[seed] {seed_db} -> {working_db}", flush=True)

    settings.data_dir = working_db
    repository = LocalDataRepository(settings.data_dir)
    backup_path = None
    if not args.skip_backup:
        backup_path = repository.backup_database(PROJECT_ROOT / "tmp" / "db_backups")
        if backup_path is not None:
            print(f"[backup] {backup_path}", flush=True)

    syncer = TushareDataSyncer(settings, repository)
    report = syncer.sync_required_data(limit=args.limit)
    report["backup_path"] = str(backup_path) if backup_path else None

    report_path = Path(args.report).expanduser()
    if not report_path.is_absolute():
        report_path = (PROJECT_ROOT / report_path).resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if final_db is not None:
        published_path = repository.clone_database(final_db)
        print(f"[publish] {published_path}", flush=True)
        report["published_database_path"] = str(published_path)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    final_database_path = report.get("published_database_path") or report["database_path"]
    print(f"[done] 数据同步完成，数据库: {final_database_path}", flush=True)
    print(f"[report] {report_path}", flush=True)
    print(json.dumps(report["tables"], ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
