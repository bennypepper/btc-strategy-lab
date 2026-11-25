import numpy as np
import pandas as pd
import pytest
import streamlit as st

import core.data_loader as dl
from core.data_loader import (
    build_heatmap_matrix,
    get_dataset_date_range,
    get_dataset_slice,
    load_heatmap_pivot,
    load_smart_dataset,
    load_static_dataset,
    load_top100_trials,
)


def test_get_dataset_slice():
    dates = pd.date_range("2020-01-01", "2020-01-10", freq="D")
    df = pd.DataFrame({"val": range(10)}, index=dates)

    sliced = get_dataset_slice(df, "2020-01-03", "2020-01-06")
    assert len(sliced) == 4
    assert sliced.index.min() == pd.Timestamp("2020-01-03")
    assert sliced.index.max() == pd.Timestamp("2020-01-06")


def test_get_dataset_date_range():
    dates = pd.date_range("2018-05-10", "2024-11-25", freq="D")
    df = pd.DataFrame({"x": range(len(dates))}, index=dates)

    min_d, max_d = get_dataset_date_range(df)
    assert min_d == "2018-05-10"
    assert max_d == "2024-11-25"


def test_build_heatmap_matrix():
    trial_log = pd.DataFrame(
        {
            "threshold_buy": [10, 10, 20, 20],
            "threshold_sell": [70, 80, 70, 80],
            "total_return": [1.2, 1.5, 2.0, 2.5],
        }
    )
    pivot = build_heatmap_matrix(trial_log, metric="total_return")
    assert (70 in pivot.index) and (80 in pivot.index)
    assert (10 in pivot.columns) and (20 in pivot.columns)
    assert pivot.loc[80, 20] == 2.5


def test_load_static_dataset_normalized_and_not_live():
    st.cache_data.clear()
    df = load_static_dataset()
    assert isinstance(df.index, pd.DatetimeIndex)
    assert df.index.tz is None
    assert df.index.is_monotonic_increasing
    assert df.attrs.get("is_live") is False
    assert {"btc_close", "btc_open", "trolololo"}.issubset(df.columns)


def test_load_smart_dataset_dedup_no_price_ffill_and_is_live(monkeypatch, tmp_path):
    st.cache_data.clear()
    dates = pd.date_range("2015-01-01", "2026-03-15", freq="D")
    # Build a minimal synthetic static parquet covering confirmed cycle dates
    n = len(dates)
    prices = np.linspace(200.0, 70000.0, n)
    static_df = pd.DataFrame(
        {
            "btc_close": prices,
            "btc_open": prices * 0.99,
            "cbbi_confidence": np.linspace(10.0, 80.0, n),
            "trolololo": np.linspace(10.0, 80.0, n),
        },
        index=dates,
    )
    static_path = tmp_path / "master.parquet"
    static_df.to_parquet(static_path)
    monkeypatch.setattr(dl, "DATASET_PATH", static_path)

    # Mock yfinance returning overlapping day (2026-03-15), 1 valid new day, and 1 invalid price day
    new_idx = pd.to_datetime(["2026-03-15", "2026-03-16", "2026-03-17"])
    mock_yf = pd.DataFrame(
        {
            "Close": [71000.0, 72000.0, -5.0],
            "Open": [70500.0, 71500.0, 72000.0],
        },
        index=new_idx,
    )
    monkeypatch.setattr(dl.yf, "download", lambda *a, **kw: mock_yf)

    combined = load_smart_dataset()
    assert combined.attrs.get("is_live") is True
    assert not combined.index.has_duplicates
    assert combined.index.is_monotonic_increasing
    # Overlapping 2026-03-15 keeps latest yfinance row
    assert combined.loc[pd.Timestamp("2026-03-15"), "btc_close"] == pytest.approx(71000.0)
    # Invalid negative-price day (2026-03-17) was dropped, NOT forward-filled
    assert pd.Timestamp("2026-03-17") not in combined.index
    assert pd.Timestamp("2026-03-16") in combined.index
    # Cosmetic CBBI column was forward-filled on valid new day
    assert pd.notna(combined.loc[pd.Timestamp("2026-03-16"), "cbbi_confidence"])


def test_load_smart_dataset_fallback_sets_is_live_false(monkeypatch):
    st.cache_data.clear()

    def _boom(*args, **kwargs):
        raise OSError("network unreachable")

    monkeypatch.setattr(dl.yf, "download", _boom)
    df = load_smart_dataset()
    assert df.attrs.get("is_live") is False
    assert not df.empty


def test_load_heatmap_pivot_and_top100_trials(monkeypatch, tmp_path):
    st.cache_data.clear()
    rows = []
    for i in range(150):
        rows.append(
            {
                "threshold_buy": 1 + (i % 5),
                "threshold_sell": 60 + (i % 3) * 10,
                "allocation_buy_pct": 0.1,
                "allocation_sell_pct": 0.1,
                "total_return": float(i),
                "max_drawdown": 0.2,
                "sharpe_ratio": 1.0,
                "win_rate": 0.5,
                "trade_count": 10,
            }
        )
    s1_path = tmp_path / "s1.parquet"
    pd.DataFrame(rows).to_parquet(s1_path)
    monkeypatch.setattr(dl, "SCENARIO_1_LOG", s1_path)

    pivot = load_heatmap_pivot(1, metric="total_return")
    assert not pivot.empty
    assert pivot.loc[80, 3] == pytest.approx(137.0)

    top100 = load_top100_trials(1, metric="total_return")
    assert len(top100) == 100
    assert top100["total_return"].iloc[0] == pytest.approx(149.0)
    assert top100["total_return"].iloc[-1] == pytest.approx(50.0)
