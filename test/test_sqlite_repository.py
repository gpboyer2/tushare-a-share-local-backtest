from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.data.repository import LocalDataRepository


def test_repository_uses_sqlite_file_and_roundtrip(tmp_path: Path) -> None:
    repo = LocalDataRepository(tmp_path / "data_cache")

    stock_basic = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"],
            "symbol": ["000001"],
            "name": ["平安银行"],
            "area": ["深圳"],
            "industry": ["银行"],
            "market": ["主板"],
            "list_date": ["19910403"],
            "delist_date": [""],
            "list_status": ["L"],
        }
    )
    daily = pd.DataFrame(
        {
            "ts_code": ["000001.SZ", "000001.SZ"],
            "trade_date": ["20240102", "20240103"],
            "open": [10.0, 10.1],
            "high": [10.2, 10.3],
            "low": [9.8, 9.9],
            "close": [10.1, 10.2],
            "vol": [1000.0, 1200.0],
            "amount": [10000.0, 12000.0],
        }
    )

    repo.save_reference("stock_basic", stock_basic)
    repo.save_symbol_frame("daily", "000001.SZ", daily)

    assert repo.db_path.name == "data_cache.db"
    assert repo.db_path.exists()

    loaded_basic = repo.get_stock_basic()
    loaded_daily = repo.get_daily("000001.SZ")

    assert loaded_basic.iloc[0]["ts_code"] == "000001.SZ"
    assert loaded_daily["trade_date"].tolist() == ["20240102", "20240103"]
