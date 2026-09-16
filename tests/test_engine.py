import numpy as np
import pandas as pd
import pytest

from core.engine import run_backtest_numba, run_backtest_full

def test_numba_zero_trades():
    """Verify that an inactive strategy retains initial cash with zero trades."""
    n = 60
    signals = np.full(n, 50.0, dtype=np.float64)  # Hold zone
    prices_open = np.full(n, 40000.0, dtype=np.float64)
    prices_close = np.full(n, 40000.0, dtype=np.float64)

    total_ret, mdd, sharpe, wins, sell_count, trade_count = run_backtest_numba(
        signals=signals,
        prices_open=prices_open,
        prices_close=prices_close,
        threshold_buy=20,
        threshold_sell=80,
        alloc_buy_pct=0.10,
        alloc_sell_pct=0.10,
        initial_cash=100_000.0,
        fee_rate=0.001,
    )
    assert total_ret == pytest.approx(0.0)
    assert mdd == pytest.approx(0.0)
    assert trade_count == 0
    assert sell_count == 0
    assert wins == 0

def test_engine_numba_vs_full_parity():
    """Verify that run_backtest_numba and run_backtest_full produce identical scalar metrics."""
    np.random.seed(42)
    n = 120
    dates = pd.date_range("2022-01-01", periods=n, freq="D")
    
    # Generate realistic oscillatory signal and price series
    t = np.linspace(0, 4 * np.pi, n)
    signals = 50.0 + 35.0 * np.sin(t)
    prices_close = 30000.0 * (1.0 + 0.3 * np.sin(t / 2))
    prices_open = prices_close * (1.0 + np.random.normal(0, 0.005, n))

    df = pd.DataFrame({
        "trolololo": signals,
        "btc_open": prices_open,
        "btc_close": prices_close,
    }, index=dates)

    t_buy = 25
    t_sell = 75
    a_buy = 0.15
    a_sell = 0.20
    init_cash = 100_000.0
    fee = 0.001

    numba_ret, numba_mdd, numba_sharpe, numba_wins, numba_sells, numba_trades = run_backtest_numba(
        signals=signals,
        prices_open=prices_open,
        prices_close=prices_close,
        threshold_buy=t_buy,
        threshold_sell=t_sell,
        alloc_buy_pct=a_buy,
        alloc_sell_pct=a_sell,
        initial_cash=init_cash,
        fee_rate=fee,
    )

    full_res = run_backtest_full(
        df=df,
        threshold_buy=t_buy,
        threshold_sell=t_sell,
        alloc_buy_pct=a_buy,
        alloc_sell_pct=a_sell,
        initial_cash=init_cash,
        fee_rate=fee,
    )

    m = full_res.metrics
    assert m.total_return == pytest.approx(numba_ret, rel=1e-5)
    assert m.max_drawdown == pytest.approx(numba_mdd, rel=1e-5)
    assert m.sharpe_ratio == pytest.approx(numba_sharpe, rel=1e-4)
    assert m.trade_count == numba_trades
    if numba_sells > 0:
        expected_win_rate = float(numba_wins) / numba_sells
        assert m.win_rate == pytest.approx(expected_win_rate, rel=1e-5)

def test_dust_guards():
    """Verify that trades below minimum dust thresholds are ignored."""
    n = 10
    signals = np.array([10.0, 10.0, 90.0, 90.0, 50.0, 50.0, 50.0, 50.0, 50.0, 50.0])
    prices_open = np.full(n, 50000.0)
    prices_close = np.full(n, 50000.0)

    # Tiny initial cash ($5) and 1% allocation -> trade_amount = $0.05 (< $1.0)
    total_ret, mdd, sharpe, wins, sell_count, trade_count = run_backtest_numba(
        signals=signals,
        prices_open=prices_open,
        prices_close=prices_close,
        threshold_buy=20,
        threshold_sell=80,
        alloc_buy_pct=0.01,
        alloc_sell_pct=0.01,
        initial_cash=5.0,
        fee_rate=0.001,
    )
    # Dust guard should have prevented any trades
    assert trade_count == 0
