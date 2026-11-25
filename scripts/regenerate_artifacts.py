"""
scripts/regenerate_artifacts.py
===============================
Deterministic CLI generator for all derived research and simulator artifacts.

Recomputes `trolololo` on `data/master_dataset.parquet` using the immutable
confirmed-cycle channel in `core/trolololo.py`, then runs exhaustive grid
search (1,293,750 trials per scenario) in O(1) RAM using Numba parallel
streaming reduction — avoiding multi-tens-of-MB trial-log parquet allocations.

Generated artifacts
-------------------
- data/master_dataset.parquet
- data/optimal_params_summary.json
- data/live_optimal_params.json
- data/research/s1_heatmap_total_return.parquet
- data/research/s2_heatmap_total_return.parquet
- data/research/s1_top100_max_return.csv
- data/research/s2_top100_max_return.csv
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import numba
import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from core.engine import _compute_benchmark_metrics, run_backtest_full
from core.optimizer import (
    ALLOC_STEPS,
    BUY_THRESHOLDS,
    SELL_THRESHOLDS,
    _reduce_best_per_buy,
    run_live_optimization,
)
from core.trolololo import compute_trolololo

DEFAULT_INITIAL_CASH: float = 100_000.0
DEFAULT_FEE_RATE: float = 0.001
DEFAULT_SPLIT_DATE: str = "2021-01-01"
TOP_K: int = 100

SCENARIO_2_DISCLOSURE = (
    "These results were obtained by optimizing across the entire historical dataset "
    "(2012-2026) with lookahead bias by design. These configurations cannot be used "
    "as predictive trading signals; their sole purpose is to map the historical "
    "performance ceiling of the Logarithmic Regression (Trolololo) indicator."
)

TOP100_COLUMNS = [
    "threshold_buy",
    "threshold_sell",
    "allocation_buy_pct",
    "allocation_sell_pct",
    "total_return",
    "max_drawdown",
    "sharpe_ratio",
    "win_rate",
    "trade_count",
]


@numba.njit(cache=True)
def _research_backtest_kernel(
    open_prices: np.ndarray,
    close_prices: np.ndarray,
    signal: np.ndarray,
    threshold_buy: float,
    threshold_sell: float,
    alloc_buy: float,
    alloc_sell: float,
    initial_cash: float,
    fee_rate: float,
) -> tuple:
    """
    Single backtest matching `core.engine.run_backtest_numba` exactly,
    returning `(total_return, max_drawdown, sharpe_ratio, win_rate, trade_count)`.
    Inputs are pre-validated once before entering the parallel grid sweep.
    """
    n = len(open_prices)
    cash = initial_cash
    btc = 0.0
    avg_entry_price = 0.0
    trade_count = 0
    wins = 0
    sell_count = 0

    portfolio_value = np.zeros(n, dtype=np.float64)
    daily_returns = np.zeros(n, dtype=np.float64)
    portfolio_value[0] = initial_cash

    for i in range(n - 1):
        sig = signal[i]
        p_exec = open_prices[i + 1]
        p_close = close_prices[i]

        curr_val = cash + (btc * p_close)
        portfolio_value[i] = curr_val
        if i > 0:
            prev = portfolio_value[i - 1]
            daily_returns[i] = (curr_val - prev) / prev if prev > 0.0 else 0.0

        if sig <= threshold_buy:
            trade_amount = cash * alloc_buy
            if trade_amount > 1.0:
                fee = trade_amount * fee_rate
                net_usd = trade_amount - fee
                btc_bought = net_usd / p_exec
                total_cost = (btc * avg_entry_price) + trade_amount
                btc += btc_bought
                if btc > 0.0:
                    avg_entry_price = total_cost / btc
                cash -= trade_amount
                trade_count += 1
        elif sig >= threshold_sell:
            btc_sold = btc * alloc_sell
            if btc_sold > 0.000001:
                gross_usd = btc_sold * p_exec
                fee = gross_usd * fee_rate
                net_usd = gross_usd - fee
                cost_sold = btc_sold * avg_entry_price
                cash += net_usd
                btc -= btc_sold
                trade_count += 1
                if net_usd > cost_sold:
                    wins += 1
                sell_count += 1

    portfolio_value[n - 1] = cash + (btc * close_prices[n - 1])
    prev = portfolio_value[n - 2] if n >= 2 else initial_cash
    daily_returns[n - 1] = (portfolio_value[n - 1] - prev) / prev if prev > 0.0 else 0.0

    total_return = (portfolio_value[-1] - initial_cash) / initial_cash

    max_dd = 0.0
    peak = portfolio_value[0]
    for i in range(n):
        peak = max(peak, portfolio_value[i])
        dd = (peak - portfolio_value[i]) / peak if peak > 0.0 else 0.0
        max_dd = max(max_dd, dd)

    returns_slice = daily_returns[1:] if n > 1 else daily_returns
    mean_r = np.mean(returns_slice)
    std_r = np.std(returns_slice)
    rf_daily = 0.04 / 365.0
    sharpe = ((mean_r - rf_daily) / std_r) * np.sqrt(365.0) if std_r > 0.0 else 0.0
    win_rate = float(wins) / sell_count if sell_count > 0 else 0.0

    return total_return, max_dd, sharpe, win_rate, float(trade_count)


@numba.njit(cache=True, parallel=True)
def _research_grid_kernel(
    open_prices: np.ndarray,
    close_prices: np.ndarray,
    signal: np.ndarray,
    buy_thresholds: np.ndarray,
    sell_thresholds: np.ndarray,
    alloc_buys: np.ndarray,
    alloc_sells: np.ndarray,
    initial_cash: float,
    fee_rate: float,
    best_per_buy: np.ndarray,    # shape: (n_buy, 3, 8)
    heatmap_max_ret: np.ndarray, # shape: (n_sell, n_buy)
    top_k_per_buy: np.ndarray,   # shape: (n_buy, TOP_K, 9)
) -> None:
    """
    Single-pass parallel grid search computing:
      1. `best_per_buy` (max_return, max_sharpe, min_drawdown) per buy threshold
      2. `heatmap_max_ret` (n_sell x n_buy) max total_return across all alloc pairs
      3. `top_k_per_buy` (n_buy x TOP_K x 9) top-K trials by total_return per buy threshold
    """
    n_buy = len(buy_thresholds)
    n_sell = len(sell_thresholds)
    n_abuy = len(alloc_buys)
    n_asell = len(alloc_sells)
    k = top_k_per_buy.shape[1]

    for i_buy in numba.prange(n_buy):
        for s in range(3):
            for c in range(8):
                best_per_buy[i_buy, s, c] = np.nan
        for j in range(k):
            for c in range(9):
                top_k_per_buy[i_buy, j, c] = np.nan

        bt = buy_thresholds[i_buy]
        has_valid = False
        best_ret = -np.inf
        best_sharpe = -np.inf
        best_dd = np.inf

        top_count = 0
        min_pos = 0
        min_val = np.inf

        for i_sell in range(n_sell):
            st = sell_thresholds[i_sell]
            if bt >= st:
                heatmap_max_ret[i_sell, i_buy] = np.nan
                continue

            cell_max = -np.inf
            for i_abuy in range(n_abuy):
                ab = alloc_buys[i_abuy]
                for i_asell in range(n_asell):
                    as_ = alloc_sells[i_asell]
                    ret, dd, sharpe, win_rate, tc = _research_backtest_kernel(
                        open_prices,
                        close_prices,
                        signal,
                        bt,
                        st,
                        ab,
                        as_,
                        initial_cash,
                        fee_rate,
                    )

                    cell_max = max(cell_max, ret)

                    if not has_valid:
                        has_valid = True
                        best_ret = ret
                        best_sharpe = sharpe
                        best_dd = dd
                        for s in range(3):
                            best_per_buy[i_buy, s, 0] = bt
                            best_per_buy[i_buy, s, 1] = st
                            best_per_buy[i_buy, s, 2] = ab
                            best_per_buy[i_buy, s, 3] = as_
                            best_per_buy[i_buy, s, 4] = ret
                            best_per_buy[i_buy, s, 5] = sharpe
                            best_per_buy[i_buy, s, 6] = dd
                            best_per_buy[i_buy, s, 7] = tc
                    else:
                        if ret > best_ret:
                            best_ret = ret
                            best_per_buy[i_buy, 0, 0] = bt
                            best_per_buy[i_buy, 0, 1] = st
                            best_per_buy[i_buy, 0, 2] = ab
                            best_per_buy[i_buy, 0, 3] = as_
                            best_per_buy[i_buy, 0, 4] = ret
                            best_per_buy[i_buy, 0, 5] = sharpe
                            best_per_buy[i_buy, 0, 6] = dd
                            best_per_buy[i_buy, 0, 7] = tc
                        if sharpe > best_sharpe:
                            best_sharpe = sharpe
                            best_per_buy[i_buy, 1, 0] = bt
                            best_per_buy[i_buy, 1, 1] = st
                            best_per_buy[i_buy, 1, 2] = ab
                            best_per_buy[i_buy, 1, 3] = as_
                            best_per_buy[i_buy, 1, 4] = ret
                            best_per_buy[i_buy, 1, 5] = sharpe
                            best_per_buy[i_buy, 1, 6] = dd
                            best_per_buy[i_buy, 1, 7] = tc
                        if dd < best_dd:
                            best_dd = dd
                            best_per_buy[i_buy, 2, 0] = bt
                            best_per_buy[i_buy, 2, 1] = st
                            best_per_buy[i_buy, 2, 2] = ab
                            best_per_buy[i_buy, 2, 3] = as_
                            best_per_buy[i_buy, 2, 4] = ret
                            best_per_buy[i_buy, 2, 5] = sharpe
                            best_per_buy[i_buy, 2, 6] = dd
                            best_per_buy[i_buy, 2, 7] = tc

                    # Maintain per-buy top-K buffer by total_return
                    if top_count < k:
                        slot = top_count
                        top_k_per_buy[i_buy, slot, 0] = bt
                        top_k_per_buy[i_buy, slot, 1] = st
                        top_k_per_buy[i_buy, slot, 2] = ab
                        top_k_per_buy[i_buy, slot, 3] = as_
                        top_k_per_buy[i_buy, slot, 4] = ret
                        top_k_per_buy[i_buy, slot, 5] = dd
                        top_k_per_buy[i_buy, slot, 6] = sharpe
                        top_k_per_buy[i_buy, slot, 7] = win_rate
                        top_k_per_buy[i_buy, slot, 8] = tc
                        top_count += 1
                        if ret < min_val:
                            min_val = ret
                            min_pos = slot
                    elif ret > min_val:
                        top_k_per_buy[i_buy, min_pos, 0] = bt
                        top_k_per_buy[i_buy, min_pos, 1] = st
                        top_k_per_buy[i_buy, min_pos, 2] = ab
                        top_k_per_buy[i_buy, min_pos, 3] = as_
                        top_k_per_buy[i_buy, min_pos, 4] = ret
                        top_k_per_buy[i_buy, min_pos, 5] = dd
                        top_k_per_buy[i_buy, min_pos, 6] = sharpe
                        top_k_per_buy[i_buy, min_pos, 7] = win_rate
                        top_k_per_buy[i_buy, min_pos, 8] = tc
                        # Recompute minimum within the K-element buffer
                        min_pos = 0
                        min_val = top_k_per_buy[i_buy, 0, 4]
                        for j in range(1, k):
                            v = top_k_per_buy[i_buy, j, 4]
                            if v < min_val:
                                min_val = v
                                min_pos = j

            heatmap_max_ret[i_sell, i_buy] = cell_max


def _atomic_write_json(path: Path, payload: dict) -> None:
    """Atomically write a JSON file in the destination directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.stem}_",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            tmp_path = tmp.name
            json.dump(payload, tmp, indent=2)
            tmp.write("\n")
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_path, path)
    except OSError:
        if tmp_path is not None and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        raise


def _atomic_write_parquet(path: Path, df: pd.DataFrame) -> None:
    """Atomically write a DataFrame to parquet in the destination directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.parent / f".{path.stem}_{os.getpid()}.tmp.parquet"
    try:
        df.to_parquet(tmp_path)
        os.replace(tmp_path, path)
    except OSError:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def _atomic_write_csv(path: Path, df: pd.DataFrame) -> None:
    """Atomically write a DataFrame to CSV in the destination directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.parent / f".{path.stem}_{os.getpid()}.tmp.csv"
    try:
        df.to_csv(tmp_path, index=False)
        os.replace(tmp_path, path)
    except OSError:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def _validate_arrays(open_prices: np.ndarray, close_prices: np.ndarray, signal: np.ndarray) -> None:
    if len(open_prices) < 2:
        raise ValueError("Insufficient data points for grid search (need >= 2).")
    if not (np.isfinite(open_prices).all() and (open_prices > 0.0).all()):
        raise ValueError("btc_open contains non-finite or non-positive values.")
    if not (np.isfinite(close_prices).all() and (close_prices > 0.0).all()):
        raise ValueError("btc_close contains non-finite or non-positive values.")
    if not np.isfinite(signal).all():
        raise ValueError("trolololo signal contains non-finite values.")


def _run_scenario_grid(
    df_slice: pd.DataFrame,
    initial_cash: float,
    fee_rate: float,
) -> tuple[dict[str, tuple[int, int, float, float]], pd.DataFrame, pd.DataFrame]:
    """
    Run single-pass grid search on `df_slice`.

    Returns
    -------
    winners   : {"max_return": (bt, st, ab, as_), "min_drawdown": ..., "max_sharpe": ...}
    heatmap   : 46x45 DataFrame (rows=threshold_sell 100..55, cols=str(threshold_buy) 1..45)
    top100_df : DataFrame with TOP100_COLUMNS sorted descending by total_return
    """
    open_prices = df_slice["btc_open"].to_numpy(dtype=np.float64)
    close_prices = df_slice["btc_close"].to_numpy(dtype=np.float64)
    signal = df_slice["trolololo"].to_numpy(dtype=np.float64)
    _validate_arrays(open_prices, close_prices, signal)

    buy_arr = np.array(BUY_THRESHOLDS, dtype=np.float64)
    sell_arr = np.array(SELL_THRESHOLDS, dtype=np.float64)
    alloc_arr = np.array(ALLOC_STEPS, dtype=np.float64)

    best_per_buy = np.full((len(buy_arr), 3, 8), np.nan, dtype=np.float64)
    heatmap_max_ret = np.full((len(sell_arr), len(buy_arr)), np.nan, dtype=np.float64)
    top_k_per_buy = np.full((len(buy_arr), TOP_K, 9), np.nan, dtype=np.float64)

    _research_grid_kernel(
        open_prices,
        close_prices,
        signal,
        buy_arr,
        sell_arr,
        alloc_arr,
        alloc_arr,
        float(initial_cash),
        float(fee_rate),
        best_per_buy,
        heatmap_max_ret,
        top_k_per_buy,
    )

    reduced = _reduce_best_per_buy(best_per_buy)
    if reduced is None:
        raise RuntimeError("Grid search produced no valid combinations.")
    best_ret_row, best_sharpe_row, best_dd_row = reduced

    def _to_params(r: np.ndarray) -> tuple[int, int, float, float]:
        return (int(r[0]), int(r[1]), round(float(r[2]), 4), round(float(r[3]), 4))

    winners = {
        "max_return": _to_params(best_ret_row),
        "min_drawdown": _to_params(best_dd_row),
        "max_sharpe": _to_params(best_sharpe_row),
    }

    heatmap_df = pd.DataFrame(
        heatmap_max_ret,
        index=pd.Index(SELL_THRESHOLDS, name="threshold_sell"),
        columns=pd.Index([str(b) for b in BUY_THRESHOLDS], name="threshold_buy"),
    ).sort_index(ascending=False)

    flat_top = top_k_per_buy.reshape(-1, 9)
    valid_top = flat_top[np.isfinite(flat_top[:, 4])]
    order = np.argsort(-valid_top[:, 4], kind="mergesort")[:TOP_K]
    top_rows = valid_top[order]

    top100_df = pd.DataFrame(top_rows, columns=TOP100_COLUMNS)
    top100_df["threshold_buy"] = top100_df["threshold_buy"].astype(int)
    top100_df["threshold_sell"] = top100_df["threshold_sell"].astype(int)
    top100_df["allocation_buy_pct"] = top100_df["allocation_buy_pct"].round(4)
    top100_df["allocation_sell_pct"] = top100_df["allocation_sell_pct"].round(4)
    top100_df["trade_count"] = top100_df["trade_count"].astype(int)

    return winners, heatmap_df, top100_df


def _evaluate_full(
    df_slice: pd.DataFrame,
    params: tuple[int, int, float, float],
    initial_cash: float,
    fee_rate: float,
) -> dict:
    bt, st, ab, as_ = params
    sim = run_backtest_full(
        df_slice,
        threshold_buy=bt,
        threshold_sell=st,
        alloc_buy_pct=ab,
        alloc_sell_pct=as_,
        initial_cash=initial_cash,
        fee_rate=fee_rate,
    )
    m = sim.metrics
    return {
        "threshold_buy": float(bt),
        "threshold_sell": float(st),
        "allocation_buy_pct": float(ab),
        "allocation_sell_pct": float(as_),
        "total_return": float(m.total_return),
        "max_drawdown": float(m.max_drawdown),
        "sharpe_ratio": float(m.sharpe_ratio),
        "win_rate": float(m.win_rate),
        "trade_count": int(m.trade_count),
    }


def _compute_degradation(is_metrics: dict, oos_metrics: dict) -> dict:
    is_ret = float(is_metrics["total_return"])
    oos_ret = float(oos_metrics["total_return"])
    is_dd = float(is_metrics["max_drawdown"])
    oos_dd = float(oos_metrics["max_drawdown"])
    is_sharpe = float(is_metrics["sharpe_ratio"])
    oos_sharpe = float(oos_metrics["sharpe_ratio"])
    oos_trades = int(oos_metrics["trade_count"])

    ret_deg = ((is_ret - oos_ret) / abs(is_ret) * 100.0) if abs(is_ret) > 0.0 else 0.0
    dd_deg = ((oos_dd - is_dd) / abs(is_dd) * 100.0) if abs(is_dd) > 0.0 else 0.0
    sharpe_deg = ((is_sharpe - oos_sharpe) / abs(is_sharpe) * 100.0) if abs(is_sharpe) > 0.0 else 0.0

    return {
        "return_degradation_pct": float(ret_deg),
        "drawdown_degradation_pct": float(dd_deg),
        "sharpe_degradation_pct": float(sharpe_deg),
        "trade_count_oos": oos_trades,
        "low_sample_warning": bool(oos_trades < 10),
    }


def _benchmark_dict(df_slice: pd.DataFrame, initial_cash: float, fee_rate: float) -> dict:
    open_prices = df_slice["btc_open"].to_numpy(dtype=np.float64)
    close_prices = df_slice["btc_close"].to_numpy(dtype=np.float64)
    _, metrics = _compute_benchmark_metrics(open_prices, close_prices, initial_cash, fee_rate)
    return {
        "total_return": float(metrics.total_return),
        "max_drawdown": float(metrics.max_drawdown),
        "sharpe_ratio": float(metrics.sharpe_ratio),
    }


def regenerate_artifacts(
    data_dir: Path,
    split_date: str = DEFAULT_SPLIT_DATE,
    initial_cash: float = DEFAULT_INITIAL_CASH,
    fee_rate: float = DEFAULT_FEE_RATE,
) -> dict:
    """Recompute master Trolololo and regenerate all derived research & live artifacts."""
    t_start = time.perf_counter()
    dataset_path = data_dir / "master_dataset.parquet"
    if not dataset_path.exists():
        raise FileNotFoundError(f"Master dataset not found: {dataset_path}")

    df = pd.read_parquet(dataset_path)
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    df = df.sort_index()

    # 1. Recompute trolololo using immutable confirmed-cycle channel
    df["trolololo"] = compute_trolololo(df["btc_close"])
    _atomic_write_parquet(dataset_path, df)

    split_ts = pd.Timestamp(split_date)
    df_full = df.dropna(subset=["trolololo", "btc_open", "btc_close"]).copy()
    df_is = df_full[df_full.index < split_ts].copy()
    df_oos = df_full[df_full.index >= split_ts].copy()

    # 2. Scenario 1 (In-Sample grid search + Out-of-Sample evaluation)
    t_s1 = time.perf_counter()
    s1_winners, s1_heatmap, s1_top100 = _run_scenario_grid(df_is, initial_cash, fee_rate)
    s1_elapsed = time.perf_counter() - t_s1

    s1_is_metrics = {
        obj: _evaluate_full(df_is, params, initial_cash, fee_rate)
        for obj, params in s1_winners.items()
    }
    s1_oos_metrics = {
        obj: _evaluate_full(df_oos, params, initial_cash, fee_rate)
        for obj, params in s1_winners.items()
    }
    s1_degradation = {
        obj: _compute_degradation(s1_is_metrics[obj], s1_oos_metrics[obj])
        for obj in s1_winners
    }

    # 3. Scenario 2 (Full dataset exploration)
    t_s2 = time.perf_counter()
    s2_winners, s2_heatmap, s2_top100 = _run_scenario_grid(df_full, initial_cash, fee_rate)
    s2_elapsed = time.perf_counter() - t_s2

    s2_full_metrics = {
        obj: _evaluate_full(df_full, params, initial_cash, fee_rate)
        for obj, params in s2_winners.items()
    }

    # 4. Buy & Hold benchmarks (exact fee-adjusted formula from core/engine.py)
    bh_benchmark = {
        "in_sample": _benchmark_dict(df_is, initial_cash, fee_rate),
        "out_of_sample": _benchmark_dict(df_oos, initial_cash, fee_rate),
        "full_dataset": _benchmark_dict(df_full, initial_cash, fee_rate),
    }

    total_trials = len(BUY_THRESHOLDS) * len(SELL_THRESHOLDS) * len(ALLOC_STEPS) ** 2
    generated_at = time.strftime("%Y-%m-%d %H:%M:%S")
    summary_payload = {
        "metadata": {
            "generated_at": generated_at,
            "total_trials_per_run": total_trials,
        },
        "scenario_1": {
            "algorithm_used": "grid_search",
            "in_sample": s1_is_metrics,
            "out_of_sample": s1_oos_metrics,
            "degradation": s1_degradation,
        },
        "scenario_2": {
            "algorithm_used": "grid_search",
            "disclosure": SCENARIO_2_DISCLOSURE,
            "full_dataset": s2_full_metrics,
        },
        "buy_and_hold_benchmark": bh_benchmark,
    }

    # 5. Persist research artifacts atomically
    research_dir = data_dir / "research"
    _atomic_write_json(data_dir / "optimal_params_summary.json", summary_payload)
    _atomic_write_parquet(research_dir / "s1_heatmap_total_return.parquet", s1_heatmap)
    _atomic_write_parquet(research_dir / "s2_heatmap_total_return.parquet", s2_heatmap)
    _atomic_write_csv(research_dir / "s1_top100_max_return.csv", s1_top100)
    _atomic_write_csv(research_dir / "s2_top100_max_return.csv", s2_top100)

    # 6. Sync live_optimal_params.json from clean master_dataset.parquet
    live_res = run_live_optimization(
        df,
        initial_cash=initial_cash,
        fee_rate=fee_rate,
        split_date=split_date,
        persist=False,
        enforce_cooldown=False,
    )
    if live_res.status != "success":
        raise RuntimeError(f"Live optimization sync failed: {live_res.error_message}")

    live_payload = {
        "generated_at": generated_at,
        "status": live_res.status,
        "total_combinations": live_res.total_combinations,
        "elapsed_seconds": live_res.elapsed_seconds,
        "data_source": "master_snapshot_calibrated",
        "data_date_range": live_res.data_date_range,
        "max_return": live_res.max_return,
        "max_sharpe": live_res.max_sharpe,
        "min_drawdown": live_res.min_drawdown,
        "buy_and_hold": live_res.buy_and_hold,
    }
    _atomic_write_json(data_dir / "live_optimal_params.json", live_payload)

    total_elapsed = time.perf_counter() - t_start
    print(
        f"Regenerated all artifacts in {total_elapsed:.2f}s "
        f"(S1={s1_elapsed:.2f}s, S2={s2_elapsed:.2f}s, live={live_res.elapsed_seconds:.2f}s)"
    )
    return summary_payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recompute immutable Trolololo and regenerate all research/live artifacts."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=_REPO_ROOT / "data",
        help="Path to the data directory containing master_dataset.parquet.",
    )
    parser.add_argument(
        "--split-date",
        type=str,
        default=DEFAULT_SPLIT_DATE,
        help="In-sample / out-of-sample split date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--initial-cash",
        type=float,
        default=DEFAULT_INITIAL_CASH,
        help="Starting portfolio capital in USD.",
    )
    parser.add_argument(
        "--fee-rate",
        type=float,
        default=DEFAULT_FEE_RATE,
        help="Per-trade fee rate (e.g., 0.001 for 0.1%%).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    regenerate_artifacts(
        data_dir=args.data_dir,
        split_date=args.split_date,
        initial_cash=args.initial_cash,
        fee_rate=args.fee_rate,
    )


if __name__ == "__main__":
    main()
