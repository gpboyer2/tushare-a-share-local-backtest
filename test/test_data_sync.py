from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from ppll_bt.config import (
    BacktestRuntimeConfig,
    BacktestSettings,
    DataSyncConfig,
    OptionalEndpointSettings,
    StrategyConfig,
)
from ppll_bt.data.repository import LocalDataRepository
from ppll_bt.data.sync import TushareDataSyncer
from ppll_bt.data.tushare_client import TushareClientFactory


class FakePro:
    def __init__(self) -> None:
        self.calls: dict[str, int] = {
            "fina_indicator": 0,
            "stk_holdernumber": 0,
        }

    def fina_indicator(self, ts_code: str, fields: str) -> pd.DataFrame:
        self.calls["fina_indicator"] += 1
        return pd.DataFrame(
            {
                "ts_code": [ts_code],
                "ann_date": ["20240331"],
                "end_date": ["20231231"],
                "roe": [12.0],
            }
        )

    def stk_holdernumber(self, ts_code: str, fields: str) -> pd.DataFrame:
        self.calls["stk_holdernumber"] += 1
        return pd.DataFrame(
            {
                "ts_code": [ts_code],
                "ann_date": ["20240331"],
                "end_date": ["20231231"],
                "holder_num": [100000.0],
            }
        )


def test_sync_symbol_fundamental_data_skips_completed_endpoint(tmp_path: Path, monkeypatch) -> None:
    repo = LocalDataRepository(tmp_path / "data_cache")
    settings = BacktestSettings(
        project_root=tmp_path,
        data_dir=tmp_path / "data_cache",
        output_dir=tmp_path / "outputs",
        tushare_token_env="TUSHARE_TOKEN",
        optional_endpoints=OptionalEndpointSettings(),
        data_sync=DataSyncConfig(request_interval_seconds=0.0, retry_times=1, retry_backoff_seconds=0.0),
        backtest=BacktestRuntimeConfig(start_date="2024-01-01", end_date="2024-12-31"),
        strategy=StrategyConfig(),
    )
    fake_pro = FakePro()
    monkeypatch.setattr(TushareClientFactory, "create", lambda self: fake_pro)
    syncer = TushareDataSyncer(settings, repo)

    sync_tag = "19900101:20260323"
    repo.set_meta_value("required_sync:fina_indicator:000001.SZ", sync_tag)

    syncer.sync_symbol_fundamental_data("000001.SZ", sync_tag)

    assert fake_pro.calls["fina_indicator"] == 0
    assert fake_pro.calls["stk_holdernumber"] == 1
    assert repo.get_meta_value("required_sync:stk_holdernumber:000001.SZ") == sync_tag
