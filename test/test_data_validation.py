from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.data.repository import LocalDataRepository
from ppll_bt.data.validation import validate_database_completeness


def build_valid_repository(tmp_path: Path) -> Path:
    repo = LocalDataRepository(tmp_path / "data_cache")

    stock_basic = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"],
            "symbol": ["000001"],
            "name": ["平安银行"],
            "area": ["深圳"],
            "industry": ["银行"],
            "market": ["主板"],
            "list_date": ["20230103"],
            "delist_date": [""],
            "list_status": ["L"],
        }
    )
    trade_cal = pd.DataFrame(
        {
            "exchange": ["SSE"] * 5,
            "cal_date": ["20230101", "20230102", "20230103", "20230104", "20230105"],
            "is_open": ["0", "0", "1", "1", "1"],
            "pretrade_date": ["", "", "", "20230103", "20230104"],
        }
    )
    daily = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"] * 3,
            "trade_date": ["20230103", "20230104", "20230105"],
            "open": [10.0, 10.1, 10.2],
            "high": [10.2, 10.3, 10.4],
            "low": [9.8, 9.9, 10.0],
            "close": [10.1, 10.2, 10.3],
            "vol": [1000.0, 1100.0, 1200.0],
            "amount": [10000.0, 11000.0, 12000.0],
        }
    )
    daily_basic = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"] * 3,
            "trade_date": ["20230103", "20230104", "20230105"],
            "turnover_rate": [1.0, 1.1, 1.2],
            "turnover_rate_f": [1.0, 1.1, 1.2],
            "volume_ratio": [1.0, 1.0, 1.0],
            "pe": [10.0, 10.0, 10.0],
            "pe_ttm": [9.0, 9.0, 9.0],
            "pb": [1.0, 1.0, 1.0],
            "total_mv": [100000.0, 100100.0, 100200.0],
            "circ_mv": [80000.0, 80100.0, 80200.0],
        }
    )
    adj_factor = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"] * 3,
            "trade_date": ["20230103", "20230104", "20230105"],
            "adj_factor": [1.0, 1.0, 1.0],
        }
    )
    fina_indicator = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"],
            "ann_date": ["20230331"],
            "end_date": ["20221231"],
            "roe": [12.0],
        }
    )
    stk_holdernumber = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"],
            "ann_date": ["20230331"],
            "end_date": ["20221231"],
            "holder_num": [100000.0],
        }
    )

    repo.save_reference("stock_basic", stock_basic)
    repo.save_reference("trade_cal", trade_cal)
    repo.save_symbol_frame("daily", "000001.SZ", daily)
    repo.save_symbol_frame("daily_basic", "000001.SZ", daily_basic)
    repo.save_symbol_frame("adj_factor", "000001.SZ", adj_factor)
    repo.save_symbol_frame("fina_indicator", "000001.SZ", fina_indicator)
    repo.save_symbol_frame("stk_holdernumber", "000001.SZ", stk_holdernumber)
    repo.set_meta_value("required_sync:000001.SZ", "20230101:20230105")
    repo.close()
    return tmp_path / "data_cache.db"


def test_validate_database_completeness_success(tmp_path: Path) -> None:
    db_path = build_valid_repository(tmp_path)

    report = validate_database_completeness(
        db_path=db_path,
        sync_start_date="20230101",
        sync_end_date="20230105",
    )

    assert report["status"] == "success"
    assert report["summary"]["failure_count"] == 0


def test_validate_database_completeness_detects_adj_factor_gap(tmp_path: Path) -> None:
    db_path = build_valid_repository(tmp_path)
    repo = LocalDataRepository(tmp_path / "data_cache")
    repo.save_symbol_frame(
        "adj_factor",
        "000001.SZ",
        pd.DataFrame(
            {
                "ts_code": ["000001.SZ", "000001.SZ"],
                "trade_date": ["20230104", "20230105"],
                "adj_factor": [1.0, 1.0],
            }
        ),
    )
    repo.close()

    report = validate_database_completeness(
        db_path=db_path,
        sync_start_date="20230101",
        sync_end_date="20230105",
    )

    warning_codes = {item["code"] for item in report["warnings"]}
    assert report["status"] == "success"
    assert report["summary"]["failure_count"] == 0
    assert "adj_factor_history_head_gap_small" in warning_codes
    assert "adj_factor_not_cover_daily" in warning_codes


def test_validate_database_completeness_detects_stale_checkpoint(tmp_path: Path) -> None:
    db_path = build_valid_repository(tmp_path)
    repo = LocalDataRepository(tmp_path / "data_cache")
    repo.set_meta_value("required_sync:000001.SZ", "20230101:20230104")
    repo.close()

    report = validate_database_completeness(
        db_path=db_path,
        sync_start_date="20230101",
        sync_end_date="20230105",
    )

    warning_codes = {item["code"] for item in report["warnings"]}
    assert report["status"] == "success"
    assert report["summary"]["failure_count"] == 0
    assert "stale_total_sync_checkpoint" in warning_codes
