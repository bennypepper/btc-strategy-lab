import numpy as np
import pandas as pd
import pytest

from core.trolololo import compute_trolololo, get_cycle_marks, get_channel_params

def test_trolololo_computation_properties():
    """Verify that Trolololo outputs a Series bounded within [0, 100] with matching DatetimeIndex."""
    dates = pd.date_range("2015-01-01", periods=1000, freq="D")
    # Synthetic exponential price series simulating Bitcoin growth
    days = np.arange(1000, dtype=float)
    prices = 200.0 * np.exp(0.003 * days) + 50.0 * np.sin(days / 30.0)
    btc_series = pd.Series(prices, index=dates, name="btc_close")

    result = compute_trolololo(btc_series)
    assert isinstance(result, pd.Series)
    assert len(result) == len(btc_series)
    assert result.index.equals(btc_series.index)
    
    valid_vals = result.dropna()
    assert (valid_vals >= 0.0).all()
    assert (valid_vals <= 100.0).all()

def test_cycle_marks_shape():
    """Verify high and low mark boolean arrays match price series length."""
    dates = pd.date_range("2015-01-01", periods=500, freq="D")
    prices = pd.Series(np.linspace(300.0, 10000.0, 500), index=dates)
    
    high_marks, low_marks = get_cycle_marks(prices)
    assert len(high_marks) == len(prices)
    assert len(low_marks) == len(prices)
    assert high_marks.dtype == bool
    assert low_marks.dtype == bool

def test_channel_params_keys():
    """Verify get_channel_params returns expected diagnostic dictionary."""
    dates = pd.date_range("2015-01-01", periods=800, freq="D")
    prices = pd.Series(np.linspace(500.0, 20000.0, 800), index=dates)
    
    params = get_channel_params(prices)
    assert "origin_date" in params
    assert "n_high_marks" in params
    assert "n_low_marks" in params
