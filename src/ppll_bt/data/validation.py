"""
@fileoverview
数据全量校验核心逻辑。

主要职责：
- 先检查数据库结构对不对。
- 再检查必需表是否齐全、是否为空、主键是否正确。
- 再检查每只股票的日期范围、断点、财务数据和股东人数是否满足策略使用要求。
- 最后把结果分成 `failure` 和 `warning` 两类，供脚本层输出报告。

主要逻辑：
- 以 `stock_basic` 和 `trade_cal` 作为全库基准。
- 以 `daily`、`daily_basic`、`adj_factor` 检查市场数据覆盖范围。
- 以 `fina_indicator`、`stk_holdernumber` 检查策略筛选所需的基础面数据。
- 对已经确认属于源端限制的问题保留 warning，不直接误判为本地漏数。
"""

from __future__ import annotations

import sqlite3
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from ppll_bt.data.repository import TABLE_SCHEMAS


REQUIRED_ENDPOINTS = [
    "stock_basic",
    "trade_cal",
    "daily",
    "daily_basic",
    "adj_factor",
    "fina_indicator",
    "stk_holdernumber",
]

HEAD_GAP_FAILURE_THRESHOLD = 30


@dataclass(slots=True)
class CalendarIndex:
    open_days: list[str]

    def first_on_or_after(self, value: str) -> str | None:
        position = bisect_left(self.open_days, value)
        if position >= len(self.open_days):
            return None
        return self.open_days[position]

    def last_on_or_before(self, value: str) -> str | None:
        position = bisect_right(self.open_days, value) - 1
        if position < 0:
            return None
        return self.open_days[position]

    def gap_size(self, left: str, right: str) -> int:
        left_position = bisect_left(self.open_days, left)
        right_position = bisect_left(self.open_days, right)
        return max(0, right_position - left_position)


def compact_date(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if "-" in value:
        return value.replace("-", "")[:8]
    return value[:8]


def parse_compact_date(raw: str) -> date:
    return date(int(raw[:4]), int(raw[4:6]), int(raw[6:8]))


def subtract_years(raw: str, years: int) -> str:
    current = parse_compact_date(raw)
    try:
        shifted = current.replace(year=current.year - years)
    except ValueError:
        shifted = current.replace(month=2, day=28, year=current.year - years)
    return shifted.strftime("%Y%m%d")


def quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def connect_database(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def build_issue(code: str, message: str, **details: Any) -> dict[str, Any]:
    payload = {
        "code": code,
        "message": message,
    }
    if details:
        payload["details"] = details
    return payload


def fetch_table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        """
    ).fetchall()
    return {str(row["name"]) for row in rows}


def fetch_table_row_count(conn: sqlite3.Connection, table_name: str) -> int:
    return int(conn.execute(f"SELECT COUNT(*) AS total FROM {quote_identifier(table_name)}").fetchone()["total"])


def fetch_primary_key_columns(conn: sqlite3.Connection, table_name: str) -> list[str]:
    rows = conn.execute(f"PRAGMA table_info({quote_identifier(table_name)})").fetchall()
    ordered = sorted((row for row in rows if row["pk"]), key=lambda row: row["pk"])
    return [str(row["name"]) for row in ordered]


def fetch_stock_rows(conn: sqlite3.Connection) -> list[dict[str, str | None]]:
    rows = conn.execute(
        """
        SELECT ts_code, name, list_date, delist_date, list_status
        FROM stock_basic
        ORDER BY ts_code
        """
    ).fetchall()
    return [
        {
            "ts_code": str(row["ts_code"]),
            "name": None if row["name"] is None else str(row["name"]),
            "list_date": compact_date(row["list_date"]),
            "delist_date": compact_date(row["delist_date"]),
            "list_status": None if row["list_status"] is None else str(row["list_status"]),
        }
        for row in rows
    ]


def fetch_open_calendar(conn: sqlite3.Connection) -> CalendarIndex:
    rows = conn.execute(
        """
        SELECT cal_date
        FROM trade_cal
        WHERE exchange = 'SSE' AND CAST(is_open AS TEXT) = '1'
        ORDER BY cal_date
        """
    ).fetchall()
    return CalendarIndex([compact_date(row["cal_date"]) for row in rows if compact_date(row["cal_date"])])


def fetch_symbol_date_aggregates(
    conn: sqlite3.Connection,
    table_name: str,
    date_field: str,
) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT ts_code,
               COUNT(*) AS row_count,
               MIN({quote_identifier(date_field)}) AS min_value,
               MAX({quote_identifier(date_field)}) AS max_value
        FROM {quote_identifier(table_name)}
        GROUP BY ts_code
        """
    ).fetchall()
    return {
        str(row["ts_code"]): {
            "row_count": int(row["row_count"]),
            "min_value": compact_date(row["min_value"]),
            "max_value": compact_date(row["max_value"]),
        }
        for row in rows
        if row["ts_code"] is not None
    }


def fetch_fina_aggregates(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT ts_code,
               COUNT(*) AS row_count,
               MIN(ann_date) AS min_value,
               MAX(ann_date) AS max_value,
               COUNT(DISTINCT CASE WHEN SUBSTR(end_date, 5, 4) = '1231' THEN SUBSTR(end_date, 1, 4) END) AS annual_year_count
        FROM fina_indicator
        GROUP BY ts_code
        """
    ).fetchall()
    return {
        str(row["ts_code"]): {
            "row_count": int(row["row_count"]),
            "min_value": compact_date(row["min_value"]),
            "max_value": compact_date(row["max_value"]),
            "annual_year_count": int(row["annual_year_count"]),
        }
        for row in rows
        if row["ts_code"] is not None
    }


def fetch_sync_meta_map(conn: sqlite3.Connection) -> dict[str, str]:
    rows = conn.execute(
        """
        SELECT meta_key, meta_value
        FROM sync_meta
        """
    ).fetchall()
    return {str(row["meta_key"]): str(row["meta_value"]) for row in rows}


def sample_records(items: list[dict[str, Any]], sample_limit: int) -> list[dict[str, Any]]:
    return items[:sample_limit]


def is_active_symbol(stock_rows: list[dict[str, str | None]], ts_code: str) -> bool:
    for stock in stock_rows:
        if stock["ts_code"] == ts_code:
            return stock.get("list_status") == "L"
    return True


def parse_sync_tag(value: str | None) -> tuple[str, str] | None:
    if value is None:
        return None
    parts = str(value).split(":")
    if len(parts) != 2:
        return None
    start_value = compact_date(parts[0])
    end_value = compact_date(parts[1])
    if start_value is None or end_value is None:
        return None
    return start_value, end_value


def validate_database_completeness(
    db_path: Path,
    sync_start_date: str,
    sync_end_date: str,
    check_namechange: bool = False,
    sample_limit: int = 20,
) -> dict[str, Any]:
    expected_end = compact_date(sync_end_date)
    expected_start = compact_date(sync_start_date)
    if expected_start is None or expected_end is None:
        raise ValueError("同步窗口日期不能为空。")

    conn = connect_database(db_path)
    failures: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    try:
        table_names = fetch_table_names(conn)
        quick_check = conn.execute("PRAGMA quick_check").fetchone()[0]
        if str(quick_check).lower() != "ok":
            failures.append(build_issue("sqlite_quick_check_failed", "SQLite quick_check 未通过。", result=quick_check))

        expected_tables = list(REQUIRED_ENDPOINTS) + (["namechange"] if check_namechange else [])
        missing_tables = [name for name in expected_tables if name not in table_names]
        if missing_tables:
            failures.append(build_issue("missing_tables", "缺少必需数据表。", tables=missing_tables))

        if missing_tables:
            return {
                "status": "error",
                "database_path": str(db_path),
                "sync_window": {"start_date": expected_start, "end_date": expected_end},
                "quick_check": str(quick_check),
                "failures": failures,
                "warnings": warnings,
                "summary": {
                    "failure_count": len(failures),
                    "warning_count": len(warnings),
                },
            }

        table_rows = {name: fetch_table_row_count(conn, name) for name in expected_tables}
        for endpoint in expected_tables:
            if table_rows[endpoint] <= 0:
                failures.append(build_issue("empty_table", f"{endpoint} 为空表。", table=endpoint))

        for endpoint in expected_tables:
            expected_pk = TABLE_SCHEMAS[endpoint]["primary_key"]
            actual_pk = fetch_primary_key_columns(conn, TABLE_SCHEMAS[endpoint]["table"])
            if actual_pk != expected_pk:
                failures.append(
                    build_issue(
                        "primary_key_mismatch",
                        f"{endpoint} 主键不符合预期。",
                        table=endpoint,
                        expected_primary_key=expected_pk,
                        actual_primary_key=actual_pk,
                    )
                )

        stock_rows = fetch_stock_rows(conn)
        stock_count = len(stock_rows)
        if stock_count <= 0:
            failures.append(build_issue("empty_stock_basic", "stock_basic 没有股票。"))
            stock_rows = []

        calendar = fetch_open_calendar(conn)
        if not calendar.open_days:
            failures.append(build_issue("empty_trade_calendar", "trade_cal 没有可用交易日。"))
        else:
            first_open_day = calendar.open_days[0]
            last_open_day = calendar.open_days[-1]
            if last_open_day < expected_end:
                failures.append(
                    build_issue(
                        "trade_cal_end_insufficient",
                        "trade_cal 未覆盖到期望同步结束日期。",
                        expected_end_date=expected_end,
                        actual_last_open_day=last_open_day,
                    )
                )
            if first_open_day > expected_start:
                warnings.append(
                    build_issue(
                        "trade_cal_start_later_than_config",
                        "trade_cal 最早交易日晚于配置起始日期。",
                        expected_start_date=expected_start,
                        actual_first_open_day=first_open_day,
                    )
                )

        daily_agg = fetch_symbol_date_aggregates(conn, "daily", "trade_date")
        daily_basic_agg = fetch_symbol_date_aggregates(conn, "daily_basic", "trade_date")
        adj_factor_agg = fetch_symbol_date_aggregates(conn, "adj_factor", "trade_date")
        fina_agg = fetch_fina_aggregates(conn)
        holder_agg = fetch_symbol_date_aggregates(conn, "stk_holdernumber", "ann_date")
        namechange_agg = fetch_symbol_date_aggregates(conn, "namechange", "ann_date") if check_namechange else {}

        sync_meta_map = fetch_sync_meta_map(conn)
        missing_total_checkpoint: list[dict[str, Any]] = []
        stale_total_checkpoint: list[dict[str, Any]] = []
        available_market_end = max(
            [item["max_value"] for item in daily_agg.values() if item["max_value"]],
            default=expected_end,
        )
        for stock in stock_rows:
            meta_key = f"required_sync:{stock['ts_code']}"
            raw_tag = sync_meta_map.get(meta_key)
            if raw_tag is None:
                missing_total_checkpoint.append({"ts_code": stock["ts_code"]})
                continue
            parsed_tag = parse_sync_tag(raw_tag)
            if parsed_tag is None:
                stale_total_checkpoint.append(
                    {
                        "ts_code": stock["ts_code"],
                        "meta_value": raw_tag,
                    }
                )
                continue
            tag_start, tag_end = parsed_tag
            symbol_market_end = max(
                [
                    aggregate["max_value"]
                    for aggregate in (
                        daily_agg.get(stock["ts_code"]),
                        daily_basic_agg.get(stock["ts_code"]),
                        adj_factor_agg.get(stock["ts_code"]),
                    )
                    if aggregate and aggregate["max_value"]
                ],
                default=available_market_end,
            )
            if tag_start != expected_start or tag_end < symbol_market_end:
                stale_total_checkpoint.append(
                    {
                        "ts_code": stock["ts_code"],
                        "meta_value": raw_tag,
                        "required_end_date": symbol_market_end,
                    }
                )
        if missing_total_checkpoint:
            failures.append(
                build_issue(
                    "missing_total_sync_checkpoint",
                    "存在股票没有总同步断点，无法证明已经完整跑过全量同步。",
                    missing_count=len(missing_total_checkpoint),
                    sample=sample_records(missing_total_checkpoint, sample_limit),
                )
            )
        if stale_total_checkpoint:
            warnings.append(
                build_issue(
                    "stale_total_sync_checkpoint",
                    "存在股票的总同步断点早于当前库里实际最新市场数据日；这是元数据回写滞后，不代表表数据本身缺失。",
                    expected_start_date=expected_start,
                    required_end_date=available_market_end,
                    stale_count=len(stale_total_checkpoint),
                    sample=sample_records(stale_total_checkpoint, sample_limit),
                )
            )

        market_table_missing: dict[str, list[dict[str, Any]]] = {
            "daily": [],
            "daily_basic": [],
            "adj_factor": [],
        }
        market_head_gaps: dict[str, list[dict[str, Any]]] = {
            "daily": [],
            "daily_basic": [],
            "adj_factor": [],
        }
        market_tail_gaps: dict[str, list[dict[str, Any]]] = {
            "daily": [],
            "daily_basic": [],
            "adj_factor": [],
        }

        if calendar.open_days:
            for stock in stock_rows:
                list_date = stock["list_date"]
                if list_date is None or list_date > expected_end:
                    continue
                delist_date = stock["delist_date"] or expected_end
                expected_start_day = calendar.first_on_or_after(max(list_date, calendar.open_days[0]))
                expected_last_day = calendar.last_on_or_before(min(delist_date, expected_end, calendar.open_days[-1]))
                if expected_start_day is None or expected_last_day is None or expected_start_day > expected_last_day:
                    continue
                for table_name, aggregates in [
                    ("daily", daily_agg),
                    ("daily_basic", daily_basic_agg),
                    ("adj_factor", adj_factor_agg),
                ]:
                    current = aggregates.get(stock["ts_code"])
                    if current is None:
                        market_table_missing[table_name].append(
                            {
                                "ts_code": stock["ts_code"],
                                "name": stock["name"],
                                "list_date": list_date,
                                "delist_date": stock["delist_date"],
                                "list_status": stock["list_status"],
                            }
                        )
                        continue
                    if current["min_value"] and current["min_value"] > expected_start_day:
                        market_head_gaps[table_name].append(
                            {
                                "ts_code": stock["ts_code"],
                                "name": stock["name"],
                                "expected_start": expected_start_day,
                                "actual_start": current["min_value"],
                                "missing_open_days": calendar.gap_size(expected_start_day, current["min_value"]),
                            }
                        )
                    if current["max_value"] and current["max_value"] < expected_last_day:
                        market_tail_gaps[table_name].append(
                            {
                                "ts_code": stock["ts_code"],
                                "name": stock["name"],
                                "expected_end": expected_last_day,
                                "actual_end": current["max_value"],
                                "missing_open_days": calendar.gap_size(current["max_value"], expected_last_day),
                            }
                        )

        for table_name in ["daily", "daily_basic", "adj_factor"]:
            active_missing = [item for item in market_table_missing[table_name] if item.get("list_status") == "L"]
            inactive_missing = [item for item in market_table_missing[table_name] if item.get("list_status") != "L"]
            if active_missing:
                failures.append(
                    build_issue(
                        "missing_symbol_market_data",
                        f"{table_name} 存在仍在上市的股票完全没有数据。",
                        table=table_name,
                        missing_count=len(active_missing),
                        sample=sample_records(active_missing, sample_limit),
                    )
                )
            if inactive_missing:
                warnings.append(
                    build_issue(
                        "missing_symbol_market_data_inactive",
                        f"{table_name} 存在退市或非上市状态股票没有数据，可能是源端未提供。",
                        table=table_name,
                        missing_count=len(inactive_missing),
                        sample=sample_records(inactive_missing, sample_limit),
                    )
                )

        daily_head_failures = [
            item for item in market_head_gaps["daily"] if int(item["missing_open_days"]) > HEAD_GAP_FAILURE_THRESHOLD
        ]
        daily_head_warnings = [
            item for item in market_head_gaps["daily"] if int(item["missing_open_days"]) <= HEAD_GAP_FAILURE_THRESHOLD
        ]
        if daily_head_failures:
            failures.append(
                build_issue(
                    "daily_history_head_gap",
                    "daily 存在股票历史起始日期晚于应有首个交易日。",
                    gap_count=len(daily_head_failures),
                    sample=sample_records(daily_head_failures, sample_limit),
                )
            )
        if daily_head_warnings:
            warnings.append(
                build_issue(
                    "daily_history_head_gap_small",
                    "daily 存在少量首段缺口，通常是上市日与首个成交日不一致。",
                    gap_count=len(daily_head_warnings),
                    sample=sample_records(daily_head_warnings, sample_limit),
                )
            )

        daily_basic_head_failures = [
            item for item in market_head_gaps["daily_basic"] if int(item["missing_open_days"]) > HEAD_GAP_FAILURE_THRESHOLD
        ]
        daily_basic_head_warnings = [
            item for item in market_head_gaps["daily_basic"] if int(item["missing_open_days"]) <= HEAD_GAP_FAILURE_THRESHOLD
        ]
        if daily_basic_head_failures:
            warnings.append(
                build_issue(
                    "daily_basic_history_head_gap",
                    "daily_basic 存在较大的历史起始缺口；Tushare 源端对部分股票早期指标并不覆盖到首个交易日。",
                    gap_count=len(daily_basic_head_failures),
                    sample=sample_records(daily_basic_head_failures, sample_limit),
                )
            )
        if daily_basic_head_warnings:
            warnings.append(
                build_issue(
                    "daily_basic_history_head_gap_small",
                    "daily_basic 存在少量首段缺口，通常是源端早期指标未覆盖到上市首日。",
                    gap_count=len(daily_basic_head_warnings),
                    sample=sample_records(daily_basic_head_warnings, sample_limit),
                )
            )

        adj_head_failures = [
            item for item in market_head_gaps["adj_factor"] if int(item["missing_open_days"]) > HEAD_GAP_FAILURE_THRESHOLD
        ]
        adj_head_warnings = [
            item for item in market_head_gaps["adj_factor"] if int(item["missing_open_days"]) <= HEAD_GAP_FAILURE_THRESHOLD
        ]
        if adj_head_failures:
            warnings.append(
                build_issue(
                    "adj_factor_history_head_gap",
                    "adj_factor 存在较大的历史起始缺口；Tushare 源端对部分股票复权因子起始日会晚于日线起始日。",
                    gap_count=len(adj_head_failures),
                    sample=sample_records(adj_head_failures, sample_limit),
                )
            )
        if adj_head_warnings:
            warnings.append(
                build_issue(
                    "adj_factor_history_head_gap_small",
                    "adj_factor 存在少量首段缺口，通常是上市首日与首个可复权日期不一致。",
                    gap_count=len(adj_head_warnings),
                    sample=sample_records(adj_head_warnings, sample_limit),
                )
            )

        if market_tail_gaps["daily"]:
            warnings.append(
                build_issue(
                    "daily_history_tail_gap",
                    "daily 存在股票尾部日期早于期望结束交易日，可能是停牌、退市或同步不完整。",
                    gap_count=len(market_tail_gaps["daily"]),
                    sample=sample_records(market_tail_gaps["daily"], sample_limit),
                )
            )
        if market_tail_gaps["daily_basic"]:
            warnings.append(
                build_issue(
                    "daily_basic_history_tail_gap",
                    "daily_basic 存在股票尾部日期早于期望结束交易日。",
                    gap_count=len(market_tail_gaps["daily_basic"]),
                    sample=sample_records(market_tail_gaps["daily_basic"], sample_limit),
                )
            )
        if market_tail_gaps["adj_factor"]:
            warnings.append(
                build_issue(
                    "adj_factor_history_tail_gap",
                    "adj_factor 存在股票尾部日期早于期望结束交易日。",
                    gap_count=len(market_tail_gaps["adj_factor"]),
                    sample=sample_records(market_tail_gaps["adj_factor"], sample_limit),
                )
            )

        daily_basic_vs_daily_failures: list[dict[str, Any]] = []
        adj_factor_vs_daily_failures: list[dict[str, Any]] = []
        for ts_code, daily_info in daily_agg.items():
            daily_basic_info = daily_basic_agg.get(ts_code)
            if daily_basic_info is None:
                continue
            if (
                daily_basic_info["min_value"] > daily_info["min_value"]
                or daily_basic_info["max_value"] < daily_info["max_value"]
                or daily_basic_info["row_count"] < daily_info["row_count"]
            ):
                daily_basic_vs_daily_failures.append(
                    {
                        "ts_code": ts_code,
                        "daily_range": [daily_info["min_value"], daily_info["max_value"]],
                        "daily_basic_range": [daily_basic_info["min_value"], daily_basic_info["max_value"]],
                        "daily_row_count": daily_info["row_count"],
                        "daily_basic_row_count": daily_basic_info["row_count"],
                    }
                )
            adj_info = adj_factor_agg.get(ts_code)
            if adj_info is None:
                continue
            if (
                adj_info["min_value"] > daily_info["min_value"]
                or adj_info["max_value"] < daily_info["max_value"]
                or adj_info["row_count"] < daily_info["row_count"]
            ):
                adj_factor_vs_daily_failures.append(
                    {
                        "ts_code": ts_code,
                        "daily_range": [daily_info["min_value"], daily_info["max_value"]],
                        "adj_factor_range": [adj_info["min_value"], adj_info["max_value"]],
                        "daily_row_count": daily_info["row_count"],
                        "adj_factor_row_count": adj_info["row_count"],
                    }
                )

        if daily_basic_vs_daily_failures:
            warnings.append(
                build_issue(
                    "daily_basic_not_cover_daily",
                    "daily_basic 未严格覆盖 daily 的日期范围或行数；该接口在源端会出现历史起始更晚或个别交易日缺记录的情况。",
                    mismatch_count=len(daily_basic_vs_daily_failures),
                    sample=sample_records(daily_basic_vs_daily_failures, sample_limit),
                )
            )
        if adj_factor_vs_daily_failures:
            warnings.append(
                build_issue(
                    "adj_factor_not_cover_daily",
                    "adj_factor 未严格覆盖 daily 的日期范围或行数；该接口在源端可能从更晚日期开始提供。",
                    mismatch_count=len(adj_factor_vs_daily_failures),
                    sample=sample_records(adj_factor_vs_daily_failures, sample_limit),
                )
            )

        roe_required_before = subtract_years(expected_end, 3)
        fina_missing_roe: list[dict[str, Any]] = []
        fina_missing_any: list[dict[str, Any]] = []
        holder_missing_mature: list[dict[str, Any]] = []
        holder_missing_recent: list[dict[str, Any]] = []

        for stock in stock_rows:
            list_date = stock["list_date"]
            if list_date is None or list_date > expected_end:
                continue

            fina_info = fina_agg.get(stock["ts_code"])
            if fina_info is None:
                fina_missing_any.append(
                    {
                        "ts_code": stock["ts_code"],
                        "name": stock["name"],
                        "list_date": list_date,
                    }
                )
            if list_date <= roe_required_before:
                annual_year_count = 0 if fina_info is None else int(fina_info["annual_year_count"])
                if annual_year_count < 3:
                    fina_missing_roe.append(
                        {
                            "ts_code": stock["ts_code"],
                            "name": stock["name"],
                            "list_date": list_date,
                            "annual_year_count": annual_year_count,
                        }
                    )

            holder_info = holder_agg.get(stock["ts_code"])
            if holder_info is None:
                if list_date <= subtract_years(expected_end, 1):
                    holder_missing_mature.append(
                        {
                            "ts_code": stock["ts_code"],
                            "name": stock["name"],
                            "list_date": list_date,
                        }
                    )
                else:
                    holder_missing_recent.append(
                        {
                            "ts_code": stock["ts_code"],
                            "name": stock["name"],
                            "list_date": list_date,
                        }
                    )

        if fina_missing_any:
            warnings.append(
                build_issue(
                    "fina_indicator_missing_symbols",
                    "fina_indicator 存在股票完全没有数据。",
                    missing_count=len(fina_missing_any),
                    sample=sample_records(fina_missing_any, sample_limit),
                )
            )
        active_fina_missing_roe = [item for item in fina_missing_roe if is_active_symbol(stock_rows, item["ts_code"])]
        inactive_fina_missing_roe = [item for item in fina_missing_roe if not is_active_symbol(stock_rows, item["ts_code"])]
        if active_fina_missing_roe:
            failures.append(
                build_issue(
                    "fina_indicator_insufficient_annual_roe",
                    "部分上市超过 3 年的股票没有足够的年报 ROE 记录。",
                    missing_count=len(active_fina_missing_roe),
                    sample=sample_records(active_fina_missing_roe, sample_limit),
                )
            )
        if inactive_fina_missing_roe:
            warnings.append(
                build_issue(
                    "fina_indicator_insufficient_annual_roe_inactive",
                    "部分退市股票没有足够的年报 ROE 记录，可能是源端未提供。",
                    missing_count=len(inactive_fina_missing_roe),
                    sample=sample_records(inactive_fina_missing_roe, sample_limit),
                )
            )

        active_holder_missing_mature = [
            item for item in holder_missing_mature if is_active_symbol(stock_rows, item["ts_code"])
        ]
        inactive_holder_missing_mature = [
            item for item in holder_missing_mature if not is_active_symbol(stock_rows, item["ts_code"])
        ]
        if active_holder_missing_mature:
            failures.append(
                build_issue(
                    "stk_holdernumber_missing_mature_symbols",
                    "部分上市超过 1 年的股票没有任何股东人数记录。",
                    missing_count=len(active_holder_missing_mature),
                    sample=sample_records(active_holder_missing_mature, sample_limit),
                )
            )
        if inactive_holder_missing_mature:
            warnings.append(
                build_issue(
                    "stk_holdernumber_missing_mature_symbols_inactive",
                    "部分退市股票没有股东人数记录，可能是源端未提供。",
                    missing_count=len(inactive_holder_missing_mature),
                    sample=sample_records(inactive_holder_missing_mature, sample_limit),
                )
            )
        if holder_missing_recent:
            warnings.append(
                build_issue(
                    "stk_holdernumber_missing_recent_symbols",
                    "部分近一年新股暂时没有股东人数记录。",
                    missing_count=len(holder_missing_recent),
                    sample=sample_records(holder_missing_recent, sample_limit),
                )
            )

        if check_namechange:
            namechange_missing: list[dict[str, Any]] = []
            for stock in stock_rows:
                list_date = stock["list_date"]
                if list_date is None or list_date > expected_end:
                    continue
                if namechange_agg.get(stock["ts_code"]) is None and list_date <= subtract_years(expected_end, 1):
                    namechange_missing.append(
                        {
                            "ts_code": stock["ts_code"],
                            "name": stock["name"],
                            "list_date": list_date,
                        }
                    )
            if namechange_missing:
                warnings.append(
                    build_issue(
                        "namechange_missing_symbols",
                        "namechange 打开验收后，发现部分老股票没有名称变更记录。",
                        missing_count=len(namechange_missing),
                        sample=sample_records(namechange_missing, sample_limit),
                    )
                )

        return {
            "status": "success" if not failures else "error",
            "database_path": str(db_path),
            "sync_window": {"start_date": expected_start, "end_date": expected_end},
            "quick_check": str(quick_check),
            "table_row_counts": table_rows,
            "summary": {
                "stock_count": stock_count,
                "failure_count": len(failures),
                "warning_count": len(warnings),
            },
            "failures": failures,
            "warnings": warnings,
        }
    finally:
        conn.close()
