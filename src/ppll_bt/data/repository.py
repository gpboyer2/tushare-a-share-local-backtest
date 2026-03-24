"""
@fileoverview
本地 SQLite 数据仓库模块，负责表结构维护、时序读写、断点元数据和结果汇总。

主要职责：
- 对外暴露：_normalize_date、_to_ts_date、_quote_identifier、_normalize_scalar、LocalDataRepository、merge_time_series。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 维护 SQLite 表结构和主键约束。
- 提供按股票读取、按接口保存、断点元数据读写和报告汇总能力。
- 对上层隐藏 CSV/SQLite 细节，统一为本地数据仓库抽象。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

import pandas as pd


DATE_COLUMNS = {
    "trade_cal": ["cal_date", "pretrade_date"],
    "stock_basic": ["list_date", "delist_date"],
    "namechange": ["ann_date", "start_date", "end_date"],
    "daily": ["trade_date"],
    "daily_basic": ["trade_date"],
    "adj_factor": ["trade_date"],
    "fina_indicator": ["ann_date", "end_date"],
    "stk_holdernumber": ["ann_date", "end_date"],
}

TABLE_SCHEMAS: dict[str, dict[str, Any]] = {
    "stock_basic": {
        "table": "stock_basic",
        "columns": {
            "ts_code": "TEXT",
            "symbol": "TEXT",
            "name": "TEXT",
            "area": "TEXT",
            "industry": "TEXT",
            "market": "TEXT",
            "list_date": "TEXT",
            "delist_date": "TEXT",
            "list_status": "TEXT",
        },
        "primary_key": ["ts_code"],
        "sort_column": "ts_code",
    },
    "trade_cal": {
        "table": "trade_cal",
        "columns": {
            "exchange": "TEXT",
            "cal_date": "TEXT",
            "is_open": "TEXT",
            "pretrade_date": "TEXT",
        },
        "primary_key": ["exchange", "cal_date"],
        "sort_column": "cal_date",
    },
    "daily": {
        "table": "daily",
        "columns": {
            "ts_code": "TEXT",
            "trade_date": "TEXT",
            "open": "REAL",
            "high": "REAL",
            "low": "REAL",
            "close": "REAL",
            "vol": "REAL",
            "amount": "REAL",
        },
        "primary_key": ["ts_code", "trade_date"],
        "sort_column": "trade_date",
    },
    "daily_basic": {
        "table": "daily_basic",
        "columns": {
            "ts_code": "TEXT",
            "trade_date": "TEXT",
            "turnover_rate": "REAL",
            "turnover_rate_f": "REAL",
            "volume_ratio": "REAL",
            "pe": "REAL",
            "pe_ttm": "REAL",
            "pb": "REAL",
            "total_mv": "REAL",
            "circ_mv": "REAL",
        },
        "primary_key": ["ts_code", "trade_date"],
        "sort_column": "trade_date",
    },
    "adj_factor": {
        "table": "adj_factor",
        "columns": {
            "ts_code": "TEXT",
            "trade_date": "TEXT",
            "adj_factor": "REAL",
        },
        "primary_key": ["ts_code", "trade_date"],
        "sort_column": "trade_date",
    },
    "fina_indicator": {
        "table": "fina_indicator",
        "columns": {
            "ts_code": "TEXT",
            "ann_date": "TEXT",
            "end_date": "TEXT",
            "roe": "REAL",
        },
        "primary_key": ["ts_code", "ann_date", "end_date"],
        "sort_column": "ann_date",
    },
    "stk_holdernumber": {
        "table": "stk_holdernumber",
        "columns": {
            "ts_code": "TEXT",
            "ann_date": "TEXT",
            "end_date": "TEXT",
            "holder_num": "REAL",
        },
        "primary_key": ["ts_code", "ann_date", "end_date"],
        "sort_column": "ann_date",
    },
    "namechange": {
        "table": "namechange",
        "columns": {
            "ts_code": "TEXT",
            "ann_date": "TEXT",
            "start_date": "TEXT",
            "end_date": "TEXT",
            "name": "TEXT",
            "change_reason": "TEXT",
        },
        "primary_key": ["ts_code", "ann_date", "start_date", "name"],
        "sort_column": "ann_date",
    },
}


def _normalize_date(value: str | date | datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y%m%d")
    if isinstance(value, date):
        return value.strftime("%Y%m%d")
    raw = str(value).strip()
    if not raw:
        return None
    if "-" in raw:
        return raw.replace("-", "")
    return raw[:8]


def _to_ts_date(value: str | None) -> pd.Timestamp | None:
    if value is None or value == "":
        return None
    return pd.to_datetime(value, format="%Y%m%d", errors="coerce")


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _normalize_scalar(value: Any) -> Any:
    if value is None:
        return None
    if pd.isna(value):
        return None
    return value


@dataclass(slots=True)
class LocalDataRepository:
    root: Path
    db_path: Path = field(init=False)
    _conn: sqlite3.Connection = field(init=False, repr=False)
    _reference_cache: dict[str, pd.DataFrame] = field(init=False, repr=False)
    _symbol_cache: dict[tuple[str, str], pd.DataFrame] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.db_path = self.root if self.root.suffix == ".db" else self.root.parent / f"{self.root.name}.db"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path)
        self._conn.row_factory = sqlite3.Row
        self._ensure_schema()
        self._reference_cache = {}
        self._symbol_cache = {}

    def close(self) -> None:
        self._conn.close()

    def clear_runtime_cache(self) -> None:
        self._reference_cache.clear()
        self._symbol_cache.clear()

    def backup_database(self, backup_dir: Path) -> Path | None:
        if not self.db_path.exists() or self.db_path.stat().st_size == 0:
            return None
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / f"{self.db_path.stem}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        self.clone_database(backup_path)
        return backup_path

    def clone_database(self, target_path: Path) -> Path:
        target_path = target_path.expanduser().resolve()
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if target_path.exists():
            target_path.unlink()
        self._conn.commit()
        destination = sqlite3.connect(target_path)
        try:
            self._conn.backup(destination)
            destination.commit()
        finally:
            destination.close()
        return target_path

    def save_reference(self, endpoint: str, frame: pd.DataFrame) -> None:
        self._replace_rows(endpoint, self._normalize_frame(frame, endpoint))
        self._reference_cache.pop(endpoint, None)

    def save_symbol_frame(self, endpoint: str, ts_code: str, frame: pd.DataFrame) -> None:
        normalized = self._normalize_frame(frame, endpoint)
        table = TABLE_SCHEMAS[endpoint]["table"]
        with self._conn:
            self._conn.execute(f'DELETE FROM {_quote_identifier(table)} WHERE ts_code = ?', (ts_code,))
        self._append_rows(endpoint, normalized)
        self._symbol_cache.pop((endpoint, ts_code), None)

    def load_reference(self, endpoint: str) -> pd.DataFrame:
        if endpoint not in self._reference_cache:
            self._reference_cache[endpoint] = self._read_table(endpoint)
        return self._reference_cache[endpoint].copy()

    def load_symbol_frame(self, endpoint: str, ts_code: str) -> pd.DataFrame:
        key = (endpoint, ts_code)
        if key not in self._symbol_cache:
            self._symbol_cache[key] = self._read_table(endpoint, "WHERE ts_code = ?", (ts_code,))
        return self._symbol_cache[key].copy()

    def get_stock_basic(self) -> pd.DataFrame:
        frame = self.load_reference("stock_basic")
        if frame.empty:
            raise FileNotFoundError("缺少 stock_basic 缓存，请先运行下载脚本。")
        return frame.drop_duplicates(subset=["ts_code"], keep="last")

    def get_trade_calendar(
        self, start_date: str | date | datetime, end_date: str | date | datetime
    ) -> list[pd.Timestamp]:
        calendar = self.load_reference("trade_cal")
        if calendar.empty:
            raise FileNotFoundError("缺少 trade_cal 缓存，请先运行下载脚本。")
        start = _normalize_date(start_date)
        end = _normalize_date(end_date)
        calendar = calendar[calendar["is_open"].astype(str) == "1"].copy()
        calendar = calendar[(calendar["cal_date"] >= start) & (calendar["cal_date"] <= end)]
        return list(pd.to_datetime(calendar["cal_date"], format="%Y%m%d"))

    def is_first_trade_day_of_month(self, trade_date: str | date | datetime) -> bool:
        target = _normalize_date(trade_date)
        if target is None:
            return False
        calendar = self.load_reference("trade_cal")
        calendar = calendar[calendar["is_open"].astype(str) == "1"].copy()
        month_rows = calendar[calendar["cal_date"].str.startswith(target[:6])]
        if month_rows.empty:
            return False
        return target == month_rows.iloc[0]["cal_date"]

    def get_previous_trade_date(self, trade_date: str | date | datetime) -> pd.Timestamp | None:
        target = _normalize_date(trade_date)
        calendar = self.load_reference("trade_cal")
        calendar = calendar[calendar["is_open"].astype(str) == "1"].copy()
        rows = calendar[calendar["cal_date"] < target]
        if rows.empty:
            return None
        return pd.to_datetime(rows.iloc[-1]["cal_date"], format="%Y%m%d")

    def get_next_trade_date(self, trade_date: str | date | datetime) -> pd.Timestamp | None:
        target = _normalize_date(trade_date)
        calendar = self.load_reference("trade_cal")
        calendar = calendar[calendar["is_open"].astype(str) == "1"].copy()
        rows = calendar[calendar["cal_date"] > target]
        if rows.empty:
            return None
        return pd.to_datetime(rows.iloc[0]["cal_date"], format="%Y%m%d")

    def get_active_stocks(self, trade_date: str | date | datetime) -> pd.DataFrame:
        target = _to_ts_date(_normalize_date(trade_date))
        basic = self.get_stock_basic().copy()
        list_date = pd.to_datetime(basic["list_date"], format="%Y%m%d", errors="coerce")
        delist_date = pd.to_datetime(basic["delist_date"], format="%Y%m%d", errors="coerce")
        active_mask = (list_date <= target) & ((delist_date.isna()) | (delist_date > target))
        active = basic.loc[active_mask].copy()
        return active.reset_index(drop=True)

    def get_namechange(self, ts_code: str) -> pd.DataFrame:
        return self.load_symbol_frame("namechange", ts_code)

    def get_daily(self, ts_code: str) -> pd.DataFrame:
        return self.load_symbol_frame("daily", ts_code)

    def get_daily_basic(self, ts_code: str) -> pd.DataFrame:
        return self.load_symbol_frame("daily_basic", ts_code)

    def get_adj_factor(self, ts_code: str) -> pd.DataFrame:
        return self.load_symbol_frame("adj_factor", ts_code)

    def get_fina_indicator(self, ts_code: str) -> pd.DataFrame:
        return self.load_symbol_frame("fina_indicator", ts_code)

    def get_holdernumber(self, ts_code: str) -> pd.DataFrame:
        return self.load_symbol_frame("stk_holdernumber", ts_code)

    def get_bar(self, ts_code: str, trade_date: str | date | datetime) -> dict | None:
        target = _normalize_date(trade_date)
        daily = self.get_daily(ts_code)
        if daily.empty:
            return None
        row = daily[daily["trade_date"] == target]
        if row.empty:
            return None
        result = row.iloc[-1].to_dict()
        daily_basic = self.get_daily_basic(ts_code)
        basic_row = daily_basic[daily_basic["trade_date"] == target]
        if not basic_row.empty:
            result.update(basic_row.iloc[-1].to_dict())
        adj = self.get_adj_factor(ts_code)
        adj_row = adj[adj["trade_date"] == target]
        if not adj_row.empty:
            result.update(adj_row.iloc[-1].to_dict())
        return result

    def get_latest_bar_on_or_before(
        self, ts_code: str, trade_date: str | date | datetime
    ) -> dict | None:
        target = _normalize_date(trade_date)
        daily = self.get_daily(ts_code)
        if daily.empty:
            return None
        rows = daily[daily["trade_date"] <= target]
        if rows.empty:
            return None
        row = rows.iloc[-1]["trade_date"]
        return self.get_bar(ts_code, row)

    def get_history(
        self,
        ts_code: str,
        end_date: str | date | datetime,
        lookback: int,
        endpoint: str = "daily",
    ) -> pd.DataFrame:
        target = _normalize_date(end_date)
        frame = self.load_symbol_frame(endpoint, ts_code)
        if frame.empty:
            return frame
        sort_column = TABLE_SCHEMAS[endpoint]["sort_column"]
        rows = frame[frame[sort_column] <= target].copy()
        return rows.tail(lookback).reset_index(drop=True)

    def join_price_with_factor(self, ts_code: str) -> pd.DataFrame:
        daily = self.get_daily(ts_code)
        factor = self.get_adj_factor(ts_code)
        if daily.empty:
            return daily
        joined = daily.merge(factor, how="left", on=["ts_code", "trade_date"])
        joined["adj_factor"] = pd.to_numeric(joined["adj_factor"], errors="coerce").fillna(1.0)
        for column in ["open", "high", "low", "close"]:
            joined[column] = pd.to_numeric(joined[column], errors="coerce")
            joined[f"{column}_adj"] = joined[column] * joined["adj_factor"]
        joined["trade_dt"] = pd.to_datetime(joined["trade_date"], format="%Y%m%d")
        return joined

    def get_available_symbol_codes(self) -> list[str]:
        basic = self.get_stock_basic()
        return sorted(basic["ts_code"].dropna().astype(str).unique().tolist())

    def build_sync_report(self, endpoints: list[str] | None = None) -> dict[str, Any]:
        selected_endpoints = endpoints or list(TABLE_SCHEMAS.keys())
        tables: dict[str, Any] = {}
        for endpoint in selected_endpoints:
            schema = TABLE_SCHEMAS[endpoint]
            table = schema["table"]
            count_row = self._conn.execute(
                f"SELECT COUNT(*) AS total FROM {_quote_identifier(table)}"
            ).fetchone()
            report: dict[str, Any] = {
                "table": table,
                "row_count": int(count_row["total"]),
            }
            if self._table_has_column(table, "ts_code"):
                symbol_row = self._conn.execute(
                    f"SELECT COUNT(DISTINCT ts_code) AS total FROM {_quote_identifier(table)} WHERE ts_code IS NOT NULL AND ts_code != ''"
                ).fetchone()
                report["symbol_count"] = int(symbol_row["total"])
            sort_column = schema["sort_column"]
            if self._table_has_column(table, sort_column):
                range_row = self._conn.execute(
                    f"""
                    SELECT MIN({_quote_identifier(sort_column)}) AS min_value,
                           MAX({_quote_identifier(sort_column)}) AS max_value
                    FROM {_quote_identifier(table)}
                    WHERE {_quote_identifier(sort_column)} IS NOT NULL
                      AND TRIM(CAST({_quote_identifier(sort_column)} AS TEXT)) != ''
                      AND LOWER(TRIM(CAST({_quote_identifier(sort_column)} AS TEXT))) != 'nan'
                    """
                ).fetchone()
                report["min_value"] = range_row["min_value"]
                report["max_value"] = range_row["max_value"]
            tables[endpoint] = report
        return {
            "database_path": str(self.db_path),
            "database_size": self.db_path.stat().st_size if self.db_path.exists() else 0,
            "tables": tables,
        }

    def get_meta_value(self, key: str) -> str | None:
        row = self._conn.execute(
            'SELECT meta_value FROM "sync_meta" WHERE meta_key = ?',
            (key,),
        ).fetchone()
        return None if row is None else str(row["meta_value"])

    def set_meta_value(self, key: str, value: str) -> None:
        with self._conn:
            self._conn.execute(
                'INSERT OR REPLACE INTO "sync_meta" (meta_key, meta_value) VALUES (?, ?)',
                (key, value),
            )

    def _ensure_schema(self) -> None:
        self._create_table_if_missing("sync_meta", {"meta_key": "TEXT", "meta_value": "TEXT"}, ["meta_key"])
        for endpoint, schema in TABLE_SCHEMAS.items():
            self._rebuild_table_if_needed(schema["table"], schema["columns"], schema["primary_key"])
            self._create_table_if_missing(schema["table"], schema["columns"], schema["primary_key"])
            self._ensure_columns(schema["table"], schema["columns"])
        self._conn.commit()

    def _create_table_if_missing(
        self, table_name: str, columns: dict[str, str], primary_key: list[str] | None
    ) -> None:
        column_sql = ",\n                ".join(
            f"{_quote_identifier(name)} {column_type}" for name, column_type in columns.items()
        )
        pk_sql = ""
        if primary_key:
            pk_sql = f",\n                PRIMARY KEY ({', '.join(_quote_identifier(name) for name in primary_key)})"
        self._conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {_quote_identifier(table_name)} (
                {column_sql}{pk_sql}
            )
            """
        )

    def _ensure_columns(self, table_name: str, columns: dict[str, str]) -> None:
        existing = {
            row["name"] for row in self._conn.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
        }
        for column_name, column_type in columns.items():
            if column_name in existing:
                continue
            self._conn.execute(
                f"ALTER TABLE {_quote_identifier(table_name)} ADD COLUMN {_quote_identifier(column_name)} {column_type}"
            )

    def _rebuild_table_if_needed(
        self,
        table_name: str,
        columns: dict[str, str],
        primary_key: list[str] | None,
    ) -> None:
        if not self._table_exists(table_name):
            return
        rows = self._conn.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
        current_pk = [row["name"] for row in sorted(rows, key=lambda item: item["pk"]) if row["pk"]]
        expected_pk = primary_key or []
        if current_pk == expected_pk:
            return
        temp_table = f"{table_name}__rebuild"
        self._conn.execute(f"DROP TABLE IF EXISTS {_quote_identifier(temp_table)}")
        self._create_table_if_missing(temp_table, columns, primary_key)
        existing_columns = [row["name"] for row in rows]
        common_columns = [column for column in columns.keys() if column in existing_columns]
        if common_columns:
            select_columns = ", ".join(_quote_identifier(column) for column in common_columns)
            insert_columns = ", ".join(_quote_identifier(column) for column in common_columns)
            self._conn.execute(
                f"""
                INSERT OR REPLACE INTO {_quote_identifier(temp_table)} ({insert_columns})
                SELECT {select_columns}
                FROM {_quote_identifier(table_name)}
                """
            )
        self._conn.execute(f"DROP TABLE {_quote_identifier(table_name)}")
        self._conn.execute(
            f"ALTER TABLE {_quote_identifier(temp_table)} RENAME TO {_quote_identifier(table_name)}"
        )

    def _replace_rows(self, endpoint: str, frame: pd.DataFrame) -> None:
        table = TABLE_SCHEMAS[endpoint]["table"]
        with self._conn:
            self._conn.execute(f'DELETE FROM {_quote_identifier(table)}')
        self._append_rows(endpoint, frame)

    def _append_rows(self, endpoint: str, frame: pd.DataFrame) -> None:
        if frame.empty:
            return
        table = TABLE_SCHEMAS[endpoint]["table"]
        normalized = frame.copy()
        expected_columns = list(TABLE_SCHEMAS[endpoint]["columns"].keys())
        for column in expected_columns:
            if column not in normalized.columns:
                normalized[column] = None
        normalized = normalized[expected_columns]
        primary_key = TABLE_SCHEMAS[endpoint]["primary_key"]
        if primary_key:
            normalized = normalized.drop_duplicates(subset=primary_key, keep="last")
        rows = [
            tuple(_normalize_scalar(value) for value in record)
            for record in normalized.itertuples(index=False, name=None)
        ]
        placeholders = ", ".join(["?"] * len(expected_columns))
        columns_sql = ", ".join(_quote_identifier(column) for column in expected_columns)
        with self._conn:
            self._conn.executemany(
                f"INSERT INTO {_quote_identifier(table)} ({columns_sql}) VALUES ({placeholders})",
                rows,
            )

    def _read_table(
        self,
        endpoint: str,
        where_clause: str = "",
        params: tuple[Any, ...] = (),
    ) -> pd.DataFrame:
        schema = TABLE_SCHEMAS[endpoint]
        table = schema["table"]
        columns = list(schema["columns"].keys())
        columns_sql = ", ".join(_quote_identifier(column) for column in columns if self._table_has_column(table, column))
        if not columns_sql:
            return pd.DataFrame(columns=columns)
        sql = f"SELECT {columns_sql} FROM {_quote_identifier(table)}"
        if where_clause:
            sql = f"{sql} {where_clause}"
        sort_column = schema["sort_column"]
        if self._table_has_column(table, sort_column):
            sql = f"{sql} ORDER BY {_quote_identifier(sort_column)}"
        frame = pd.read_sql_query(sql, self._conn, params=params)
        return self._postprocess_frame(frame, endpoint)

    def _postprocess_frame(self, frame: pd.DataFrame, endpoint: str) -> pd.DataFrame:
        for column in DATE_COLUMNS.get(endpoint, []):
            if column in frame.columns:
                frame[column] = frame[column].fillna("").astype(str).str[:8]
        return frame

    def _normalize_frame(self, frame: pd.DataFrame, endpoint: str) -> pd.DataFrame:
        normalized = frame.copy()
        for column in DATE_COLUMNS.get(endpoint, []):
            if column in normalized.columns:
                normalized[column] = normalized[column].map(_normalize_date)
        return normalized

    def _table_has_column(self, table_name: str, column_name: str) -> bool:
        rows = self._conn.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
        return any(row["name"] == column_name for row in rows)

    def _table_exists(self, table_name: str) -> bool:
        row = self._conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        return row is not None


def merge_time_series(
    existing: pd.DataFrame,
    incoming: pd.DataFrame,
    unique_columns: Iterable[str],
    sort_column: str,
) -> pd.DataFrame:
    frames = [frame for frame in [existing, incoming] if frame is not None and not frame.empty]
    if not frames:
        return pd.DataFrame()
    merged = pd.concat(frames, ignore_index=True)
    merged = merged.drop_duplicates(subset=list(unique_columns), keep="last")
    return merged.sort_values(sort_column).reset_index(drop=True)
