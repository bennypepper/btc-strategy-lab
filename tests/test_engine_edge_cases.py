import numpy as np
import pandas as pd
import pytest

from core.engine import run_backtest_full, run_backtest_numba


def test_engine_extreme_flash_crash():
    """Verify engine handles 99.9% market crash without division by zero or NaN propagation."""
    n = 20
    dates = pd.date_range("2020-01-01", periods=n, freq="D")

    # Prices crash from 10,000 to 10
    prices_open = np.linspace(10000.0, 10.0, n)
    prices_close = np.linspace(9500.0, 10.0, n)
    # Buy on every day
    signals = np.full(n, 5.0)

    df = pd.DataFrame(
        {
            "trolololo": signals,
            "btc_open": prices_open,
            "btc_close": prices_close,
        },
        index=dates,
    )

    result = run_backtest_full(
        df=df,
        threshold_buy=20,
        threshold_sell=80,
        alloc_buy_pct=0.25,
        alloc_sell_pct=0.25,
        initial_cash=10000.0,
        fee_rate=0.001,
    )

    m = result.metrics
    assert np.isfinite(m.total_return)
    assert np.isfinite(m.max_drawdown)
    assert m.max_drawdown > 0.90  # Deep drawdown recognized
    assert np.isfinite(m.sharpe_ratio)


def test_engine_monotonic_bull_run():
    """Verify that in a monotonic bull run with high sell threshold, sells are 100% profitable."""
    n = 30
    dates = pd.date_range("2020-01-01", periods=n, freq="D")
    prices_open = np.linspace(1000.0, 20000.0, n)
    prices_close = prices_open * 1.01

    # Buy for first 5 days, sell for remaining 25 days
    signals = np.concatenate([np.full(5, 10.0), np.full(25, 90.0)])

    df = pd.DataFrame(
        {
            "trolololo": signals,
            "btc_open": prices_open,
            "btc_close": prices_close,
        },
        index=dates,
    )

    result = run_backtest_full(
        df=df,
        threshold_buy=20,
        threshold_sell=80,
        alloc_buy_pct=0.50,
        alloc_sell_pct=0.20,
        initial_cash=50000.0,
        fee_rate=0.001,
    )

    m = result.metrics
    assert m.total_return > 0.0
    assert m.sell_count > 0
    assert m.win_rate == pytest.approx(1.0)  # Every sell was at a higher price than entry


def test_engine_insufficient_rows():
    """Verify engine raises ValueError if passed fewer than 2 rows."""
    dates = pd.date_range("2020-01-01", periods=1, freq="D")
    df = pd.DataFrame(
        {
            "trolololo": [50.0],
            "btc_open": [30000.0],
            "btc_close": [30000.0],
        },
        index=dates,
    )

    with pytest.raises(ValueError, match="Insufficient data points"):
        run_backtest_full(
            df=df,
            threshold_buy=20,
            threshold_sell=80,
            alloc_buy_pct=0.1,
            alloc_sell_pct=0.1,
        )


@pytest.mark.parametrize("n_days", [0, 1])
def test_numba_insufficient_days_raises(n_days):
    """Verify run_backtest_numba raises ValueError when n_days < 2."""
    arr = np.full(n_days, 50.0, dtype=np.float64)
    prices = np.full(n_days, 30000.0, dtype=np.float64)
    with pytest.raises(ValueError):
        run_backtest_numba(arr, prices, prices, 20, 80, 0.1, 0.1)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"threshold_buy": 80, "threshold_sell": 80},
        {"threshold_buy": 85, "threshold_sell": 80},
        {"alloc_buy_pct": 0.0},
        {"alloc_buy_pct": 1.5},
        {"alloc_sell_pct": -0.1},
        {"alloc_sell_pct": 1.1},
        {"initial_cash": 0.0},
        {"initial_cash": -100.0},
        {"fee_rate": -0.001},
        {"fee_rate": 0.15},
    ],
)
def test_numba_invalid_parameters_raise(kwargs):
    """Verify run_backtest_numba rejects invalid parameters consistently with run_backtest_full."""
    n = 10
    defaults = {
        "signals": np.full(n, 50.0, dtype=np.float64),
        "prices_open": np.full(n, 30000.0, dtype=np.float64),
        "prices_close": np.full(n, 30000.0, dtype=np.float64),
        "threshold_buy": 20,
        "threshold_sell": 80,
        "alloc_buy_pct": 0.1,
        "alloc_sell_pct": 0.1,
        "initial_cash": 100_000.0,
        "fee_rate": 0.001,
    }
    defaults.update(kwargs)
    with pytest.raises(ValueError):
        run_backtest_numba(**defaults)


@pytest.mark.parametrize("bad_val", [0.0, -100.0, np.nan, np.inf, -np.inf])
def test_numba_invalid_prices_raise(bad_val):
    """Verify run_backtest_numba rejects non-finite or non-positive prices."""
    n = 10
    signals = np.full(n, 50.0, dtype=np.float64)
    good = np.full(n, 30000.0, dtype=np.float64)
    bad = good.copy()
    bad[3] = bad_val

    with pytest.raises(ValueError):
        run_backtest_numba(signals, bad, good, 20, 80, 0.1, 0.1)
    with pytest.raises(ValueError):
        run_backtest_numba(signals, good, bad, 20, 80, 0.1, 0.1)


@pytest.mark.parametrize("bad_val", [0.0, -50.0, np.inf, -np.inf])
def test_full_invalid_prices_raise(bad_val):
    """Verify run_backtest_full rejects non-finite or non-positive prices."""
    n = 10
    dates = pd.date_range("2020-01-01", periods=n, freq="D")
    df_open = pd.DataFrame(
        {
            "trolololo": np.full(n, 50.0),
            "btc_open": np.full(n, 30000.0),
            "btc_close": np.full(n, 30000.0),
        },
        index=dates,
    )
    df_open.iloc[2, 1] = bad_val
    with pytest.raises(ValueError):
        run_backtest_full(df_open, 20, 80, 0.1, 0.1)

    df_close = pd.DataFrame(
        {
            "trolololo": np.full(n, 50.0),
            "btc_open": np.full(n, 30000.0),
            "btc_close": np.full(n, 30000.0),
        },
        index=dates,
    )
    df_close.iloc[2, 2] = bad_val
    with pytest.raises(ValueError):
        run_backtest_full(df_close, 20, 80, 0.1, 0.1)


def test_full_nonfinite_signal_raises():
    """Verify run_backtest_full rejects infinite signal values after dropna."""
    n = 10
    dates = pd.date_range("2020-01-01", periods=n, freq="D")
    signals = np.full(n, 50.0)
    signals[4] = np.inf
    df = pd.DataFrame(
        {
            "trolololo": signals,
            "btc_open": np.full(n, 30000.0),
            "btc_close": np.full(n, 30000.0),
        },
        index=dates,
    )
    with pytest.raises(ValueError):
        run_backtest_full(df, 20, 80, 0.1, 0.1)
