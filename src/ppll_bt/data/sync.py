"""
@fileoverview
Tushare 数据同步器，负责组织参考数据、市场数据和基础面数据的下载与断点续跑。

主要职责：
- 对外暴露：TushareDataSyncer。
- 作为当前业务链路中的单一入口或关键模块，承载对应领域职责。

实现方式：
- 以股票为粒度组织必需接口的同步流程。
- 对市场类接口按日期块分片拉取，避免远端单次返回被截断。
- 结合 `sync_meta` 支持股票级和接口级断点续跑。

使用方式：
- 作为模块被项目内脚本或业务流程调用。
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any, Callable

import pandas as pd

from ppll_bt.config import BacktestSettings
from ppll_bt.data.repository import LocalDataRepository, merge_time_series
from ppll_bt.data.tushare_client import TushareClientFactory


REQUIRED_ENDPOINTS = [
    "stock_basic",
    "trade_cal",
    "daily",
    "daily_basic",
    "adj_factor",
    "fina_indicator",
    "stk_holdernumber",
]


class TushareDataSyncer:
    """负责把 Tushare 数据增量缓存到本地 SQLite。"""

    def __init__(self, settings: BacktestSettings, repository: LocalDataRepository) -> None:
        self.settings = settings
        self.repository = repository
        self.pro = TushareClientFactory(settings).create()

    def sync_required_data(self, limit: int | None = None) -> dict[str, Any]:
        start_date = self.settings.data_sync.start_date.replace("-", "")
        end_date = self.settings.data_sync.end_date.replace("-", "")
        sync_tag = f"{start_date}:{end_date}"
        started_at = datetime.now().isoformat(timespec="seconds")
        self.sync_reference_data(start_date, end_date)
        symbols = self.repository.get_available_symbol_codes()
        if limit is not None:
            symbols = symbols[:limit]

        total = len(symbols)
        for index, ts_code in enumerate(symbols, start=1):
            checkpoint_key = f"required_sync:{ts_code}"
            if self.repository.get_meta_value(checkpoint_key) == sync_tag:
                print(f"[skip] {index}/{total} {ts_code}", flush=True)
                continue
            print(f"[sync] {index}/{total} {ts_code}", flush=True)
            self.sync_symbol_market_data(ts_code, start_date, end_date)
            self.sync_symbol_fundamental_data(ts_code, sync_tag)
            if (
                self.settings.optional_endpoints.namechange_for_st
                and self.settings.strategy.use_namechange_for_st_filter
            ):
                self.sync_namechange(ts_code, sync_tag)
            self.repository.set_meta_value(checkpoint_key, sync_tag)
        self.repository.clear_runtime_cache()
        report = self.repository.build_sync_report(
            REQUIRED_ENDPOINTS
            + (["namechange"] if self.settings.optional_endpoints.namechange_for_st else [])
        )
        report["sync_window"] = {"start_date": start_date, "end_date": end_date}
        report["requested_symbol_count"] = total
        report["completed_at"] = datetime.now().isoformat(timespec="seconds")
        report["started_at"] = started_at
        report["validation"] = self._build_validation(report, start_date, end_date)
        if report["validation"]["status"] != "success":
            raise RuntimeError(f"数据校验失败: {report['validation']['errors']}")
        return report

    def sync_reference_data(self, start_date: str, end_date: str) -> None:
        self.sync_stock_basic()
        self.sync_trade_calendar(start_date, end_date)

    def sync_stock_basic(self) -> None:
        frames: list[pd.DataFrame] = []
        for status in ["L", "D", "P"]:
            frame = self._call(
                lambda: self.pro.stock_basic(
                    exchange="",
                    list_status=status,
                    fields="ts_code,symbol,name,area,industry,market,list_date,delist_date,list_status",
                ),
                f"stock_basic({status})",
            )
            frames.append(frame)
        merged = pd.concat(frames, ignore_index=True)
        merged = merged.drop_duplicates(subset=["ts_code"], keep="last")
        self.repository.save_reference("stock_basic", merged)

    def sync_trade_calendar(self, start_date: str, end_date: str) -> None:
        frame = self._call(
            lambda: self.pro.trade_cal(
                exchange="SSE",
                start_date=start_date,
                end_date=end_date,
                fields="exchange,cal_date,is_open,pretrade_date",
            ),
            "trade_cal",
        )
        existing = self.repository.load_reference("trade_cal")
        merged = merge_time_series(existing, frame, ["exchange", "cal_date"], "cal_date")
        self.repository.save_reference("trade_cal", merged)

    def sync_symbol_market_data(self, ts_code: str, start_date: str, end_date: str) -> None:
        self._sync_symbol_range(
            endpoint="daily",
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fetcher=lambda s, e: self.pro.daily(
                ts_code=ts_code,
                start_date=s,
                end_date=e,
                fields="ts_code,trade_date,open,high,low,close,vol,amount",
            ),
        )
        self._sync_symbol_range(
            endpoint="daily_basic",
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fetcher=lambda s, e: self.pro.daily_basic(
                ts_code=ts_code,
                start_date=s,
                end_date=e,
                fields="ts_code,trade_date,turnover_rate,turnover_rate_f,volume_ratio,pe,pe_ttm,pb,total_mv,circ_mv",
            ),
        )
        self._sync_symbol_range(
            endpoint="adj_factor",
            ts_code=ts_code,
            start_date=start_date,
            end_date=end_date,
            fetcher=lambda s, e: self.pro.adj_factor(
                ts_code=ts_code,
                start_date=s,
                end_date=e,
                fields="ts_code,trade_date,adj_factor",
            ),
        )

    def sync_symbol_fundamental_data(self, ts_code: str, sync_tag: str) -> None:
        self._sync_full_symbol_endpoint(
            endpoint="fina_indicator",
            ts_code=ts_code,
            sync_tag=sync_tag,
            fetcher=lambda: self.pro.fina_indicator(
                ts_code=ts_code,
                fields="ts_code,ann_date,end_date,roe",
            ),
            merge_keys=["ts_code", "end_date", "ann_date"],
            sort_column="ann_date",
        )
        self._sync_full_symbol_endpoint(
            endpoint="stk_holdernumber",
            ts_code=ts_code,
            sync_tag=sync_tag,
            fetcher=lambda: self.pro.stk_holdernumber(
                ts_code=ts_code,
                fields="ts_code,ann_date,end_date,holder_num",
            ),
            merge_keys=["ts_code", "ann_date", "end_date"],
            sort_column="ann_date",
        )

    def sync_namechange(self, ts_code: str, sync_tag: str) -> None:
        self._sync_full_symbol_endpoint(
            endpoint="namechange",
            ts_code=ts_code,
            sync_tag=sync_tag,
            fetcher=lambda: self.pro.namechange(
                ts_code=ts_code,
                fields="ts_code,ann_date,start_date,end_date,name,change_reason",
            ),
            merge_keys=["ts_code", "ann_date", "start_date", "name"],
            sort_column="ann_date",
            allow_empty=True,
        )

    def _sync_symbol_range(
        self,
        endpoint: str,
        ts_code: str,
        start_date: str,
        end_date: str,
        fetcher: Callable[[str, str], pd.DataFrame],
    ) -> None:
        existing = self.repository.load_symbol_frame(endpoint, ts_code)
        fetch_ranges = self._build_missing_ranges(existing, start_date, end_date)
        if not fetch_ranges:
            return
        merged = existing
        for range_start, range_end in fetch_ranges:
            for chunk_start, chunk_end in self._split_date_range(range_start, range_end):
                incoming = self._call(
                    lambda rs=chunk_start, re=chunk_end: fetcher(rs, re),
                    f"{endpoint}({ts_code},{chunk_start},{chunk_end})",
                    allow_empty=True,
                )
                if incoming is None or incoming.empty:
                    continue
                merged = merge_time_series(merged, incoming, ["ts_code", "trade_date"], "trade_date")
                self.repository.save_symbol_frame(endpoint, ts_code, merged)

    def _sync_full_symbol_endpoint(
        self,
        endpoint: str,
        ts_code: str,
        sync_tag: str,
        fetcher: Callable[[], pd.DataFrame],
        merge_keys: list[str],
        sort_column: str,
        allow_empty: bool = False,
    ) -> None:
        checkpoint_key = self._build_symbol_endpoint_checkpoint_key(endpoint, ts_code)
        if self.repository.get_meta_value(checkpoint_key) == sync_tag:
            print(f"[skip-endpoint] {endpoint} {ts_code}", flush=True)
            return
        frame = self._call(fetcher, f"{endpoint}({ts_code})", allow_empty=allow_empty)
        if frame is None:
            return
        existing = self.repository.load_symbol_frame(endpoint, ts_code)
        merged = merge_time_series(existing, frame, merge_keys, sort_column)
        self.repository.save_symbol_frame(endpoint, ts_code, merged)
        self.repository.set_meta_value(checkpoint_key, sync_tag)

    def _build_symbol_endpoint_checkpoint_key(self, endpoint: str, ts_code: str) -> str:
        return f"required_sync:{endpoint}:{ts_code}"

    def _build_missing_ranges(
        self, existing: pd.DataFrame, start_date: str, end_date: str
    ) -> list[tuple[str, str]]:
        if existing.empty:
            return [(start_date, end_date)]
        existing = existing.sort_values("trade_date")
        min_date = str(existing.iloc[0]["trade_date"])
        max_date = str(existing.iloc[-1]["trade_date"])
        ranges: list[tuple[str, str]] = []
        if start_date < min_date:
            prev_day = (datetime.strptime(min_date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
            ranges.append((start_date, prev_day))
        if end_date > max_date:
            next_day = (datetime.strptime(max_date, "%Y%m%d") + timedelta(days=1)).strftime("%Y%m%d")
            ranges.append((next_day, end_date))
        return ranges

    def _split_date_range(self, start_date: str, end_date: str, chunk_days: int = 3000) -> list[tuple[str, str]]:
        start = datetime.strptime(start_date, "%Y%m%d")
        end = datetime.strptime(end_date, "%Y%m%d")
        if start > end:
            return []
        ranges: list[tuple[str, str]] = []
        current = start
        while current <= end:
            chunk_end = min(current + timedelta(days=chunk_days - 1), end)
            ranges.append((current.strftime("%Y%m%d"), chunk_end.strftime("%Y%m%d")))
            current = chunk_end + timedelta(days=1)
        return ranges

    def _call(self, func: Callable[[], pd.DataFrame], label: str, allow_empty: bool = False) -> pd.DataFrame | None:
        last_error: Exception | None = None
        for attempt in range(self.settings.data_sync.retry_times):
            try:
                result = func()
                time.sleep(self.settings.data_sync.request_interval_seconds)
                if result is None:
                    if allow_empty:
                        return pd.DataFrame()
                    raise RuntimeError(f"{label} 返回空结果。")
                return result
            except Exception as exc:  # pragma: no cover - 依赖远端 API
                last_error = exc
                sleep_seconds = self.settings.data_sync.retry_backoff_seconds * (attempt + 1)
                print(f"[retry] {label} attempt={attempt + 1} error={exc}", flush=True)
                time.sleep(sleep_seconds)
        if allow_empty:
            print(f"[warn] {label} 获取失败，按空数据处理: {last_error}", flush=True)
            return pd.DataFrame()
        raise RuntimeError(f"{label} 获取失败: {last_error}") from last_error

    def _build_validation(self, report: dict[str, Any], start_date: str, end_date: str) -> dict[str, Any]:
        tables = report["tables"]
        errors: list[str] = []
        warnings: list[str] = []
        for endpoint in REQUIRED_ENDPOINTS:
            row_count = int(tables.get(endpoint, {}).get("row_count") or 0)
            if row_count <= 0:
                errors.append(f"{endpoint} 为空表")
        trade_cal = tables.get("trade_cal", {})
        if trade_cal.get("min_value") and str(trade_cal["min_value"]) > start_date:
            warnings.append(
                f"trade_cal 最早日期为 {trade_cal['min_value']}，晚于配置起始日期 {start_date}"
            )
        if trade_cal.get("max_value") and str(trade_cal["max_value"]) < end_date:
            errors.append("trade_cal 结束日期不足")
        return {
            "status": "success" if not errors else "error",
            "errors": errors,
            "warnings": warnings,
        }
