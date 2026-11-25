import json

import numpy as np
import pandas as pd
import pytest

import core.optimizer as opt
from core.engine import run_backtest_full, run_backtest_numba


def _make_sample_df(n: int = 250, start: str = "2019-01-01") -> pd.DataFrame:
    rng = np.random.default_rng(7)
    dates = pd.date_range(start, periods=n, freq="D")
    t = np.linspace(0, 6 * np.pi, n)
    signal = 50.0 + 40.0 * np.sin(t)
    close = 10000.0 * (1.0 + 0.35 * np.sin(t / 2.0))
    open_ = close * (1.0 + rng.normal(0.0, 0.004, n))
    return pd.DataFrame(
        {"btc_open": open_, "btc_close": close, "trolololo": signal},
        index=dates,
    )


def test_optimizer_kernel_parity_with_engine():
    """Verify _full_backtest_kernel matches run_backtest_numba and run_backtest_full."""
    df = _make_sample_df(150)
    open_p = df["btc_open"].to_numpy(dtype=np.float64)
    close_p = df["btc_close"].to_numpy(dtype=np.float64)
    sig = df["trolololo"].to_numpy(dtype=np.float64)

    t_buy, t_sell = 25, 75
    a_buy, a_sell = 0.15, 0.20
    cash, fee = 100_000.0, 0.001

    k_ret, k_sharpe, k_dd, k_tc = opt._full_backtest_kernel(
        open_p, close_p, sig, float(t_buy), float(t_sell), a_buy, a_sell, cash, fee
    )
    n_ret, n_mdd, n_sharpe, _wins, _sells, n_tc = run_backtest_numba(
        sig, open_p, close_p, t_buy, t_sell, a_buy, a_sell, cash, fee
    )
    f_res = run_backtest_full(df, t_buy, t_sell, a_buy, a_sell, cash, fee)

    assert k_ret == pytest.approx(n_ret, rel=1e-12, abs=1e-12)
    assert k_sharpe == pytest.approx(n_sharpe, rel=1e-12, abs=1e-12)
    assert k_dd == pytest.approx(n_mdd, rel=1e-12, abs=1e-12)
    assert k_tc == n_tc

    assert k_ret == pytest.approx(f_res.metrics.total_return, rel=1e-12, abs=1e-12)
    assert k_sharpe == pytest.approx(f_res.metrics.sharpe_ratio, rel=1e-12, abs=1e-12)
    assert k_dd == pytest.approx(f_res.metrics.max_drawdown, rel=1e-12, abs=1e-12)
    assert k_tc == f_res.metrics.trade_count


def test_full_backtest_kernel_guards_short_input():
    """Verify _full_backtest_kernel rejects n < 2 instead of indexing out of bounds."""
    one = np.array([10000.0], dtype=np.float64)
    sig = np.array([50.0], dtype=np.float64)
    with pytest.raises(ValueError):
        opt._full_backtest_kernel(one, one, sig, 20.0, 80.0, 0.1, 0.1, 100_000.0, 0.001)


def test_run_live_optimization_persist_false_and_bh_fee(monkeypatch, tmp_path):
    """Verify persist=False skips disk write and bh_return accounts for entry fee."""
    monkeypatch.setattr(opt, "BUY_THRESHOLDS", [20, 30])
    monkeypatch.setattr(opt, "SELL_THRESHOLDS", [70, 80])
    monkeypatch.setattr(opt, "ALLOC_STEPS", [0.10, 0.20])
    target_file = tmp_path / "live_optimal_params.json"
    monkeypatch.setattr(opt, "LIVE_PARAMS_PATH", target_file)
    monkeypatch.setattr(opt, "_last_run_at", None)

    df = _make_sample_df(250, start="2019-01-01")
    initial_cash = 100_000.0
    fee_rate = 0.01  # 1% fee makes fee impact clearly visible

    res = opt.run_live_optimization(
        df,
        initial_cash=initial_cash,
        fee_rate=fee_rate,
        split_date="2021-01-01",
        persist=False,
        enforce_cooldown=False,
    )
    assert res.status == "success"
    assert not target_file.exists()

    expected_bh_btc = (initial_cash * (1.0 - fee_rate)) / float(df["btc_open"].iloc[0])
    expected_bh_ret = ((expected_bh_btc * float(df["btc_close"].iloc[-1])) - initial_cash) / initial_cash
    assert res.buy_and_hold["total_return"] == pytest.approx(round(expected_bh_ret, 6), abs=1e-6)


def test_run_live_optimization_atomic_persist_and_corrupt_load(monkeypatch, tmp_path):
    """Verify persist=True writes atomically and load_live_params handles corrupt JSON."""
    monkeypatch.setattr(opt, "BUY_THRESHOLDS", [20])
    monkeypatch.setattr(opt, "SELL_THRESHOLDS", [80])
    monkeypatch.setattr(opt, "ALLOC_STEPS", [0.10])
    target_file = tmp_path / "live_optimal_params.json"
    monkeypatch.setattr(opt, "LIVE_PARAMS_PATH", target_file)
    monkeypatch.setattr(opt, "_last_run_at", None)

    df = _make_sample_df(250, start="2019-01-01")
    res = opt.run_live_optimization(
        df,
        split_date="2021-01-01",
        persist=True,
        enforce_cooldown=False,
    )
    assert res.status == "success"
    assert target_file.exists()

    loaded = opt.load_live_params()
    assert isinstance(loaded, dict)
    assert loaded["status"] == "success"

    # Corrupt the file and verify graceful recovery
    target_file.write_text("{corrupt json", encoding="utf-8")
    assert opt.load_live_params() is None

    # Non-dict JSON payload
    target_file.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
    assert opt.load_live_params() is None


def test_run_live_optimization_concurrency_lock_and_cooldown(monkeypatch, tmp_path):
    """Verify non-blocking lock rejects concurrent runs and cooldown rate-limits repeated runs."""
    monkeypatch.setattr(opt, "BUY_THRESHOLDS", [20])
    monkeypatch.setattr(opt, "SELL_THRESHOLDS", [80])
    monkeypatch.setattr(opt, "ALLOC_STEPS", [0.10])
    monkeypatch.setattr(opt, "LIVE_PARAMS_PATH", tmp_path / "live_optimal_params.json")
    monkeypatch.setattr(opt, "_last_run_at", None)

    df = _make_sample_df(250, start="2019-01-01")

    # 1. Lock contention
    acquired = opt._OPT_LOCK.acquire(blocking=False)
    assert acquired
    try:
        res_locked = opt.run_live_optimization(df, persist=False, enforce_cooldown=False)
        assert res_locked.status == "error"
        assert "already running" in res_locked.error_message.lower()
    finally:
        opt._OPT_LOCK.release()

    # 2. First run succeeds and sets cooldown timestamp
    res_ok = opt.run_live_optimization(df, persist=False, enforce_cooldown=True)
    assert res_ok.status == "success"

    # 3. Immediate second run with enforce_cooldown=True is rejected
    res_cool = opt.run_live_optimization(df, persist=False, enforce_cooldown=True)
    assert res_cool.status == "error"
    assert "cooldown" in res_cool.error_message.lower()


@pytest.mark.parametrize(
    "kwargs",
    [
        {"initial_cash": 0.0},
        {"initial_cash": -1000.0},
        {"initial_cash": float("nan")},
        {"fee_rate": -0.01},
        {"fee_rate": 0.20},
        {"fee_rate": float("inf")},
        {"split_date": "not-a-date"},
        {"split_date": ""},
    ],
)
def test_run_live_optimization_input_validation(monkeypatch, kwargs):
    """Verify invalid scalar/date inputs return status='error' cleanly."""
    monkeypatch.setattr(opt, "_last_run_at", None)
    df = _make_sample_df(250, start="2019-01-01")
    res = opt.run_live_optimization(df, persist=False, enforce_cooldown=False, **kwargs)
    assert res.status == "error"
    assert res.error_message


def test_run_live_optimization_invalid_price_and_signal_values(monkeypatch):
    """Verify non-positive or non-finite prices/signals return status='error'."""
    monkeypatch.setattr(opt, "_last_run_at", None)

    df_bad_price = _make_sample_df(250, start="2019-01-01")
    df_bad_price.iloc[10, 0] = -5.0
    res = opt.run_live_optimization(df_bad_price, persist=False, enforce_cooldown=False)
    assert res.status == "error"

    df_bad_sig = _make_sample_df(250, start="2019-01-01")
    df_bad_sig.iloc[10, 2] = np.inf
    res2 = opt.run_live_optimization(df_bad_sig, persist=False, enforce_cooldown=False)
    assert res2.status == "error"


def test_grid_search_best_kernel_matches_bruteforce_and_tie_breaking():
    """Verify O(1)-RAM _grid_search_best_kernel matches brute-force _grid_search_kernel bit-for-bit."""
    df = _make_sample_df(220, start="2019-01-01")
    open_p = df["btc_open"].to_numpy(dtype=np.float64)
    close_p = df["btc_close"].to_numpy(dtype=np.float64)
    sig = df["trolololo"].to_numpy(dtype=np.float64)

    # Include an overlapping threshold (bt=60 >= st=60) to verify invalid combos are skipped cleanly
    buy_arr = np.array([15.0, 25.0, 40.0, 60.0], dtype=np.float64)
    sell_arr = np.array([60.0, 75.0, 90.0], dtype=np.float64)
    alloc_arr = np.array([0.05, 0.15, 0.25], dtype=np.float64)

    n_combos = len(buy_arr) * len(sell_arr) * len(alloc_arr) ** 2
    brute = np.zeros((n_combos, 8), dtype=np.float64)
    opt._grid_search_kernel(
        open_p, close_p, sig, buy_arr, sell_arr, alloc_arr, alloc_arr, 100_000.0, 0.001, brute
    )
    valid_brute = brute[(brute[:, 0] < brute[:, 1]) & (brute[:, 4] > -999.0)]
    expected_max_ret = valid_brute[int(np.argmax(valid_brute[:, 4]))]
    expected_max_sharpe = valid_brute[int(np.argmax(valid_brute[:, 5]))]
    expected_min_dd = valid_brute[int(np.argmin(valid_brute[:, 6]))]

    best_per_buy = np.full((len(buy_arr), 3, 8), np.nan, dtype=np.float64)
    opt._grid_search_best_kernel(
        open_p, close_p, sig, buy_arr, sell_arr, alloc_arr, alloc_arr, 100_000.0, 0.001, best_per_buy
    )

    got_max_ret, got_max_sharpe, got_min_dd = opt._reduce_best_per_buy(best_per_buy)
    np.testing.assert_array_equal(got_max_ret, expected_max_ret)
    np.testing.assert_array_equal(got_max_sharpe, expected_max_sharpe)
    np.testing.assert_array_equal(got_min_dd, expected_min_dd)

    # Tie-breaking test: constant signal outside buy/sell bounds produces identical 0-trade rows
    flat_sig = np.full(len(sig), 50.0, dtype=np.float64)
    brute_tie = np.zeros((n_combos, 8), dtype=np.float64)
    opt._grid_search_kernel(
        open_p, close_p, flat_sig, buy_arr, sell_arr, alloc_arr, alloc_arr, 100_000.0, 0.001, brute_tie
    )
    valid_tie = brute_tie[(brute_tie[:, 0] < brute_tie[:, 1]) & (brute_tie[:, 4] > -999.0)]

    best_tie = np.full((len(buy_arr), 3, 8), np.nan, dtype=np.float64)
    opt._grid_search_best_kernel(
        open_p, close_p, flat_sig, buy_arr, sell_arr, alloc_arr, alloc_arr, 100_000.0, 0.001, best_tie
    )
    tie_ret, tie_sharpe, tie_dd = opt._reduce_best_per_buy(best_tie)
    np.testing.assert_array_equal(tie_ret, valid_tie[int(np.argmax(valid_tie[:, 4]))])
    np.testing.assert_array_equal(tie_sharpe, valid_tie[int(np.argmax(valid_tie[:, 5]))])
    np.testing.assert_array_equal(tie_dd, valid_tie[int(np.argmin(valid_tie[:, 6]))])
