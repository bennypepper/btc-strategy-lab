import numpy as np
import pandas as pd
import pytest

from core.data_loader import (
    get_dataset_slice,
    get_dataset_date_range,
    build_heatmap_matrix,
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
    trial_log = pd.DataFrame({
        "threshold_buy": [10, 10, 20, 20],
        "threshold_sell": [70, 80, 70, 80],
        "total_return": [1.2, 1.5, 2.0, 2.5],
    })
    pivot = build_heatmap_matrix(trial_log, metric="total_return")
    assert (70 in pivot.index) and (80 in pivot.index)
    assert (10 in pivot.columns) and (20 in pivot.columns)
    assert pivot.loc[80, 20] == 2.5
