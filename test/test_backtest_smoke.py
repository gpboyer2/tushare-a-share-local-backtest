from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.backtest import LocalBacktestEngine
from ppll_bt.config import (
    BacktestRuntimeConfig,
    BacktestSettings,
    DataSyncConfig,
    OptionalEndpointSettings,
    StrategyConfig,
)
from ppll_bt.data.repository import LocalDataRepository
from ppll_bt.strategy import JoinQuantMigratedStrategy


def test_local_backtest_smoke(tmp_path: Path, capsys) -> None:
    data_root = tmp_path / "data_cache"
    repo = LocalDataRepository(data_root)

    calendar = pd.DataFrame(
        {
            "exchange": ["SSE"] * 6,
            "cal_date": ["20240102", "20240103", "20240104", "20240105", "20240108", "20240109"],
            "is_open": ["1"] * 6,
            "pretrade_date": ["20240101", "20240102", "20240103", "20240104", "20240105", "20240108"],
        }
    )
    stock_basic = pd.DataFrame(
        {
            "ts_code": ["000001.SZ", "000002.SZ"],
            "symbol": ["000001", "000002"],
            "name": ["平安银行", "万科A"],
            "area": ["深圳", "深圳"],
            "industry": ["银行", "地产"],
            "market": ["主板", "主板"],
            "list_date": ["19910403", "19910129"],
            "delist_date": ["", ""],
            "list_status": ["L", "L"],
        }
    )
    repo.save_reference("trade_cal", calendar)
    repo.save_reference("stock_basic", stock_basic)

    prices_1 = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"] * 80,
            "trade_date": pd.date_range("2023-09-01", periods=80, freq="B").strftime("%Y%m%d"),
            "open": [10 + i * 0.01 for i in range(80)],
            "high": [10.2 + i * 0.01 for i in range(80)],
            "low": [9.8 + i * 0.01 for i in range(80)],
            "close": [10 + i * 0.01 for i in range(80)],
            "vol": [1_000_000 + i * 1000 for i in range(80)],
            "amount": [10_000_000] * 80,
        }
    )
    prices_2 = pd.DataFrame(
        {
            "ts_code": ["000002.SZ"] * 80,
            "trade_date": pd.date_range("2023-09-01", periods=80, freq="B").strftime("%Y%m%d"),
            "open": [8 + i * 0.005 for i in range(80)],
            "high": [8.1 + i * 0.005 for i in range(80)],
            "low": [7.9 + i * 0.005 for i in range(80)],
            "close": [8 + i * 0.005 for i in range(80)],
            "vol": [800_000 + i * 500 for i in range(80)],
            "amount": [8_000_000] * 80,
        }
    )
    basic_1 = pd.DataFrame(
        {
            "ts_code": ["000001.SZ"] * 80,
            "trade_date": prices_1["trade_date"],
            "turnover_rate": ["2.0"] * 80,
            "turnover_rate_f": ["2.0"] * 80,
            "volume_ratio": ["1.0"] * 80,
            "pe": ["10.0"] * 80,
            "pe_ttm": ["10.0"] * 80,
            "pb": ["1.0"] * 80,
            "total_mv": ["1000000"] * 80,
            "circ_mv": ["900000"] * 80,
        }
    )
    basic_2 = basic_1.copy()
    basic_2["ts_code"] = "000002.SZ"
    basic_2["trade_date"] = prices_2["trade_date"]
    factor_1 = pd.DataFrame({"ts_code": ["000001.SZ"] * 80, "trade_date": prices_1["trade_date"], "adj_factor": ["1.0"] * 80})
    factor_2 = pd.DataFrame({"ts_code": ["000002.SZ"] * 80, "trade_date": prices_2["trade_date"], "adj_factor": ["1.0"] * 80})
    fina = pd.DataFrame(
        {
            "ts_code": ["000001.SZ", "000001.SZ", "000001.SZ", "000002.SZ", "000002.SZ", "000002.SZ"],
            "ann_date": ["20230420", "20240420", "20250420", "20230420", "20240420", "20250420"],
            "end_date": ["20221231", "20231231", "20241231", "20221231", "20231231", "20241231"],
            "roe": ["12", "12", "12", "11", "11", "11"],
        }
    )
    holders = pd.DataFrame(
        {
            "ts_code": ["000001.SZ", "000002.SZ"],
            "ann_date": ["20231231", "20231231"],
            "end_date": ["20231231", "20231231"],
            "holder_num": ["100000", "100000"],
        }
    )
    repo.save_symbol_frame("daily", "000001.SZ", prices_1)
    repo.save_symbol_frame("daily", "000002.SZ", prices_2)
    repo.save_symbol_frame("daily_basic", "000001.SZ", basic_1)
    repo.save_symbol_frame("daily_basic", "000002.SZ", basic_2)
    repo.save_symbol_frame("adj_factor", "000001.SZ", factor_1)
    repo.save_symbol_frame("adj_factor", "000002.SZ", factor_2)
    repo.save_symbol_frame("fina_indicator", "000001.SZ", fina[fina["ts_code"] == "000001.SZ"])
    repo.save_symbol_frame("fina_indicator", "000002.SZ", fina[fina["ts_code"] == "000002.SZ"])
    repo.save_symbol_frame("stk_holdernumber", "000001.SZ", holders[holders["ts_code"] == "000001.SZ"])
    repo.save_symbol_frame("stk_holdernumber", "000002.SZ", holders[holders["ts_code"] == "000002.SZ"])

    settings = BacktestSettings(
        project_root=tmp_path,
        data_dir=data_root,
        output_dir=tmp_path / "outputs",
        tushare_token_env="TUSHARE_TOKEN",
        optional_endpoints=OptionalEndpointSettings(),
        data_sync=DataSyncConfig(),
        backtest=BacktestRuntimeConfig(
            start_date="2024-01-02",
            end_date="2024-01-09",
            initial_cash=300000.0,
            progress_log_interval=1,
        ),
        strategy=StrategyConfig(ma_periods=[5, 10, 20], ma_fitting_min_months=6, breakout_target_hold_count=1),
    )

    strategy = JoinQuantMigratedStrategy(repo, settings.strategy)
    engine = LocalBacktestEngine(settings, repo, strategy)
    result = engine.run()
    captured = capsys.readouterr()

    assert result.summary["end_value"] > 0
    assert "total_return" in result.summary
    assert "[progress] phase=start" in captured.out
    assert "[progress] phase=done" in captured.out
