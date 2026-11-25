"""
core/optimizer.py
=================
Dynamic Grid Search Optimizer for BTC Strategy Lab.

Runs a Numba-JIT-compiled grid search over all (buy_threshold, sell_threshold,
alloc_buy, alloc_sell) combinations against any DataFrame.

Designed to be called against live BTC price data so that optimal params
stay aligned with the current market data — addressing the
"Index Revision Bias" documented in our research.

Architecture note
-----------------
This is a WEBAPP extension for practical deployment.
The academic research (the core research repository) was conducted on a frozen snapshot (master_dataset.parquet)
and its results are fixed. This optimizer produces a `live_optimal_params.json`
used only by the Simulator's "Live API" mode.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numba
import numpy as np
import pandas as pd

from core.engine import warmup_numba

logger = logging.getLogger(__name__)

# ── Output path ───────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parents[1]
LIVE_PARAMS_PATH = _ROOT / "data" / "live_optimal_params.json"

# ── Concurrency & rate-limit guards ───────────────────────────────────────────
_OPT_LOCK = threading.Lock()
_COOLDOWN_SECONDS: float = 60.0
_last_run_at: float | None = None

# ── Grid search parameter space (mirrors the core research repository methodology) ────────────────
BUY_THRESHOLDS  = list(range(1, 46, 1))     # 1, 2 … 45  (45 values)
SELL_THRESHOLDS = list(range(55, 101, 1))   # 55, 56 … 100  (46 values)
ALLOC_STEPS     = [x / 100.0 for x in range(1, 26, 1)]  # 1% to 25% (25 values)
# Total combinations: 45 × 46 × 25 × 25 = 1,293,750 — exactly matches research pipeline


@dataclass
class OptimizationResult:
    status: str                    # "success" | "error"
    total_combinations: int = 0
    elapsed_seconds: float = 0.0
    data_source: str = ""
    data_date_range: str = ""
    error_message: str = ""

    # Best params by objective
    max_return: dict = field(default_factory=dict)
    max_sharpe: dict = field(default_factory=dict)
    min_drawdown: dict = field(default_factory=dict)

    # Benchmark
    buy_and_hold: dict = field(default_factory=dict)


# ── Core Numba grid kernel ────────────────────────────────────────────────────

@numba.njit(cache=True)
def _full_backtest_kernel(
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
    Vectorised single backtest loop. Returns (total_return, sharpe, max_drawdown, trade_count).
    Uses same T+1 execution logic as production engine.
    """
    n = len(open_prices)
    if n < 2:
        raise ValueError("Insufficient data points for backtesting (need at least 2).")

    cash = initial_cash
    btc = 0.0
    trade_count = 0
    avg_entry_price = 0.0

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
            daily_returns[i] = (curr_val - prev) / prev if prev > 0 else 0.0

        if sig <= threshold_buy:
            trade_amount = cash * alloc_buy
            if trade_amount > 1.0:
                fee = trade_amount * fee_rate
                net_usd = trade_amount - fee
                btc_bought = net_usd / p_exec
                total_cost = (btc * avg_entry_price) + trade_amount
                btc += btc_bought
                if btc > 0:
                    avg_entry_price = total_cost / btc
                cash -= trade_amount
                trade_count += 1
        elif sig >= threshold_sell:
            btc_sold = btc * alloc_sell
            if btc_sold > 0.000001:
                gross_usd = btc_sold * p_exec
                fee = gross_usd * fee_rate
                net_usd = gross_usd - fee
                cash += net_usd
                btc -= btc_sold
                trade_count += 1

    portfolio_value[n - 1] = cash + (btc * close_prices[n - 1])
    prev = portfolio_value[n - 2] if n >= 2 else initial_cash
    daily_returns[n - 1] = (portfolio_value[n - 1] - prev) / prev if prev > 0 else 0.0

    total_return = (portfolio_value[-1] - initial_cash) / initial_cash

    max_dd = 0.0
    peak = portfolio_value[0]
    for i in range(n):
        peak = max(peak, portfolio_value[i])
        dd = (peak - portfolio_value[i]) / peak if peak > 0 else 0.0
        max_dd = max(max_dd, dd)

    returns_slice = daily_returns[1:] if n > 1 else daily_returns
    mean_r = np.mean(returns_slice)
    std_r = np.std(returns_slice)
    rf_daily = 0.04 / 365.0
    sharpe = 0.0
    if std_r > 0.0:
        sharpe = ((mean_r - rf_daily) / std_r) * np.sqrt(365.0)

    return total_return, sharpe, max_dd, trade_count


@numba.njit(cache=True, parallel=True)
def _grid_search_kernel(
    open_prices: np.ndarray,
    close_prices: np.ndarray,
    signal: np.ndarray,
    buy_thresholds: np.ndarray,
    sell_thresholds: np.ndarray,
    alloc_buys: np.ndarray,
    alloc_sells: np.ndarray,
    initial_cash: float,
    fee_rate: float,
    results: np.ndarray,   # shape: (N_combos, 8) — buy, sell, abuy, asell, ret, sharpe, dd, tc
) -> None:
    """
    Parallel grid sweep. Writes each row of `results` in-place.
    results columns: buy_thresh, sell_thresh, alloc_buy, alloc_sell, total_return, sharpe, max_dd, trade_count
    """
    if len(open_prices) < 2:
        raise ValueError("Insufficient data points for backtesting (need at least 2).")

    n_buy   = len(buy_thresholds)
    n_sell  = len(sell_thresholds)
    n_abuy  = len(alloc_buys)
    n_asell = len(alloc_sells)

    total = n_buy * n_sell * n_abuy * n_asell

    for idx in numba.prange(total):
        i_buy   = idx // (n_sell * n_abuy * n_asell)
        rem     = idx  % (n_sell * n_abuy * n_asell)
        i_sell  = rem  // (n_abuy * n_asell)
        rem2    = rem   % (n_abuy * n_asell)
        i_abuy  = rem2  // n_asell
        i_asell = rem2  % n_asell

        bt = buy_thresholds[i_buy]
        st = sell_thresholds[i_sell]
        ab = alloc_buys[i_abuy]
        as_ = alloc_sells[i_asell]

        if bt >= st:
            results[idx, 0] = bt
            results[idx, 1] = st
            results[idx, 2] = ab
            results[idx, 3] = as_
            results[idx, 4] = -999.0
            results[idx, 5] = -999.0
            results[idx, 6] = 0.0
            results[idx, 7] = 0.0
            continue

        ret, sharpe, dd, tc = _full_backtest_kernel(
            open_prices, close_prices, signal,
            bt, st, ab, as_, initial_cash, fee_rate,
        )

        results[idx, 0] = bt
        results[idx, 1] = st
        results[idx, 2] = ab
        results[idx, 3] = as_
        results[idx, 4] = ret
        results[idx, 5] = sharpe
        results[idx, 6] = dd
        results[idx, 7] = tc


@numba.njit(cache=True, parallel=True)
def _grid_search_best_kernel(
    open_prices: np.ndarray,
    close_prices: np.ndarray,
    signal: np.ndarray,
    buy_thresholds: np.ndarray,
    sell_thresholds: np.ndarray,
    alloc_buys: np.ndarray,
    alloc_sells: np.ndarray,
    initial_cash: float,
    fee_rate: float,
    best_per_buy: np.ndarray,  # shape: (n_buy, 3, 8) — [max_return, max_sharpe, min_drawdown]
) -> None:
    """
    O(1)-RAM parallel streaming grid search.

    Parallelizes across `i_buy` and records only the 3 objective winners per
    `i_buy` (slot 0: max_return, slot 1: max_sharpe, slot 2: min_drawdown)
    into `best_per_buy` (~8.6 KB for 45 buy thresholds instead of 82.8 MB).

    Iterates `(i_sell, i_abuy, i_asell)` in strictly ascending order using
    strict `>` / `<` comparisons so tie-breaking is bit-for-bit identical to
    `np.argmax` / `np.argmin` on a flat `(i_buy, i_sell, i_abuy, i_asell)` grid.
    """
    if len(open_prices) < 2:
        raise ValueError("Insufficient data points for backtesting (need at least 2).")

    n_buy   = len(buy_thresholds)
    n_sell  = len(sell_thresholds)
    n_abuy  = len(alloc_buys)
    n_asell = len(alloc_sells)

    for i_buy in numba.prange(n_buy):
        for s in range(3):
            for c in range(8):
                best_per_buy[i_buy, s, c] = np.nan

        bt = buy_thresholds[i_buy]
        has_valid = False
        best_ret = -np.inf
        best_sharpe = -np.inf
        best_dd = np.inf

        for i_sell in range(n_sell):
            st = sell_thresholds[i_sell]
            if bt >= st:
                continue

            for i_abuy in range(n_abuy):
                ab = alloc_buys[i_abuy]
                for i_asell in range(n_asell):
                    as_ = alloc_sells[i_asell]
                    ret, sharpe, dd, tc = _full_backtest_kernel(
                        open_prices, close_prices, signal,
                        bt, st, ab, as_, initial_cash, fee_rate,
                    )
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


def _reduce_best_per_buy(
    best_per_buy: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """
    Reduce per-buy streaming winners in ascending `i_buy` order with strict `>` / `<`.

    Returns `(max_return_row, max_sharpe_row, min_drawdown_row)`, or `None` if no
    valid combination exists.
    """
    best_ret_row: np.ndarray | None = None
    best_sharpe_row: np.ndarray | None = None
    best_dd_row: np.ndarray | None = None

    for i_buy in range(best_per_buy.shape[0]):
        ret_row = best_per_buy[i_buy, 0]
        if np.isnan(ret_row[4]):
            continue
        sharpe_row = best_per_buy[i_buy, 1]
        dd_row = best_per_buy[i_buy, 2]

        if best_ret_row is None or ret_row[4] > best_ret_row[4]:
            best_ret_row = ret_row
        if best_sharpe_row is None or sharpe_row[5] > best_sharpe_row[5]:
            best_sharpe_row = sharpe_row
        if best_dd_row is None or dd_row[6] < best_dd_row[6]:
            best_dd_row = dd_row

    if best_ret_row is None or best_sharpe_row is None or best_dd_row is None:
        return None
    return best_ret_row.copy(), best_sharpe_row.copy(), best_dd_row.copy()


def warmup_optimizer() -> None:
    """Pre-JIT the optimizer kernels with tiny dummy data."""
    warmup_numba()
    tiny = np.ones(20, dtype=np.float64) * 50000.0
    sig  = np.linspace(10, 90, 20)
    bts  = np.array([20.0, 30.0])
    sts  = np.array([60.0, 70.0])
    als  = np.array([0.10, 0.25])
    best_per_buy = np.full((len(bts), 3, 8), np.nan, dtype=np.float64)
    _grid_search_best_kernel(tiny, tiny, sig, bts, sts, als, als, 100_000.0, 0.001, best_per_buy)


def run_live_optimization(
    df: pd.DataFrame,
    initial_cash: float = 100_000.0,
    fee_rate: float = 0.001,
    progress_cb: Callable[[float, str], None] | None = None,
    split_date: str = "2021-01-01",
    persist: bool = True,
    enforce_cooldown: bool = True,
) -> OptimizationResult:
    """
    Run full grid search against the provided DataFrame (should be live BTC data with Trolololo).

    Parameters
    ----------
    df               : DataFrame with btc_open, btc_close, trolololo columns; DatetimeIndex
    initial_cash     : Starting capital (must be finite and > 0)
    fee_rate         : Per-trade fee (must be finite and in [0.0, 0.10])
    progress_cb      : Optional (pct_float, status_str) callback for Streamlit progress bars
    split_date       : IS/OOS split date for in-sample optimization (default 2021-01-01)
    persist          : When True, atomically persist results to LIVE_PARAMS_PATH
    enforce_cooldown : When True, enforce per-process cooldown between runs

    Returns          : OptimizationResult dataclass
    """
    global _last_run_at

    if not _OPT_LOCK.acquire(blocking=False):
        return OptimizationResult(
            status="error",
            error_message="An optimization is already running. Please wait for it to finish.",
        )

    try:
        if enforce_cooldown and _last_run_at is not None:
            elapsed_since = time.monotonic() - _last_run_at
            if elapsed_since < _COOLDOWN_SECONDS:
                remaining = int(np.ceil(_COOLDOWN_SECONDS - elapsed_since))
                return OptimizationResult(
                    status="error",
                    error_message=(
                        f"Optimizer cooldown active. Please wait {remaining}s before running again."
                    ),
                )

        if not np.isfinite(initial_cash) or initial_cash <= 0.0:
            return OptimizationResult(
                status="error",
                error_message="initial_cash must be finite and strictly positive.",
            )
        if not np.isfinite(fee_rate) or not (0.0 <= fee_rate <= 0.10):
            return OptimizationResult(
                status="error",
                error_message="fee_rate must be finite and between 0.0 and 0.10.",
            )

        try:
            split_ts = pd.Timestamp(split_date)
        except (ValueError, TypeError):
            return OptimizationResult(
                status="error",
                error_message=f"Invalid split_date: {split_date!r}. Expected ISO YYYY-MM-DD.",
            )
        if pd.isna(split_ts):
            return OptimizationResult(
                status="error",
                error_message="Invalid split_date: cannot be empty or NaT.",
            )

        required_cols = {"btc_open", "btc_close", "trolololo"}
        missing_cols = required_cols - set(df.columns)
        if missing_cols:
            return OptimizationResult(
                status="error",
                error_message=f"Missing required columns: {sorted(missing_cols)}.",
            )

        if progress_cb:
            progress_cb(0.02, "Preparing data arrays…")

        # Use in-sample slice for optimization (prevents overfitting on OOS)
        df_is = df[df.index < split_ts].copy()
        df_is = df_is.dropna(subset=["btc_open", "btc_close", "trolololo"])

        if len(df_is) < 200:
            return OptimizationResult(
                status="error",
                error_message=f"Insufficient IS data: only {len(df_is)} rows before {split_date}.",
            )

        open_prices  = df_is["btc_open"].to_numpy(dtype=np.float64)
        close_prices = df_is["btc_close"].to_numpy(dtype=np.float64)
        signal       = df_is["trolololo"].to_numpy(dtype=np.float64)

        if not (np.isfinite(open_prices).all() and (open_prices > 0.0).all()):
            return OptimizationResult(
                status="error",
                error_message="btc_open contains non-finite or non-positive values.",
            )
        if not (np.isfinite(close_prices).all() and (close_prices > 0.0).all()):
            return OptimizationResult(
                status="error",
                error_message="btc_close contains non-finite or non-positive values.",
            )
        if not np.isfinite(signal).all():
            return OptimizationResult(
                status="error",
                error_message="trolololo signal contains non-finite values.",
            )

        buy_arr   = np.array(BUY_THRESHOLDS,  dtype=np.float64)
        sell_arr  = np.array(SELL_THRESHOLDS, dtype=np.float64)
        alloc_arr = np.array(ALLOC_STEPS,     dtype=np.float64)

        n_combos = len(buy_arr) * len(sell_arr) * len(alloc_arr) ** 2
        best_per_buy = np.full((len(buy_arr), 3, 8), np.nan, dtype=np.float64)

        if progress_cb:
            progress_cb(0.08, f"Running {n_combos:,} combinations (Numba parallel)…")

        t0 = time.perf_counter()
        _grid_search_best_kernel(
            open_prices, close_prices, signal,
            buy_arr, sell_arr, alloc_arr, alloc_arr,
            float(initial_cash), float(fee_rate), best_per_buy,
        )
        elapsed = time.perf_counter() - t0

        if progress_cb:
            progress_cb(0.70, "Extracting best parameters…")

        reduced = _reduce_best_per_buy(best_per_buy)
        del best_per_buy

        if reduced is None:
            return OptimizationResult(status="error", error_message="No valid combinations found.")

        def _format_row(r: np.ndarray) -> dict:
            return {
                "threshold_buy":       int(r[0]),
                "threshold_sell":      int(r[1]),
                "allocation_buy_pct":  round(float(r[2]), 4),
                "allocation_sell_pct": round(float(r[3]), 4),
                "total_return":        round(float(r[4]), 6),
                "sharpe_ratio":        round(float(r[5]), 6),
                "max_drawdown":        round(float(r[6]), 6),
                "trade_count":         int(r[7]),
            }

        best_ret_row, best_sharpe_row, best_dd_row = reduced
        best_return   = _format_row(best_ret_row)
        best_sharpe   = _format_row(best_sharpe_row)
        best_drawdown = _format_row(best_dd_row)

        # Buy & Hold benchmark on IS period (including entry fee, matching core/engine.py)
        bh_start = float(open_prices[0])
        bh_end   = float(close_prices[-1])
        bh_btc = (initial_cash * (1.0 - fee_rate)) / bh_start
        bh_return = ((bh_btc * bh_end) - initial_cash) / initial_cash

        if progress_cb:
            progress_cb(0.90, "Saving results…" if persist else "Finalizing results…")

        date_min = str(df_is.index.min().date())
        date_max = str(df_is.index.max().date())

        result = OptimizationResult(
            status="success",
            total_combinations=n_combos,
            elapsed_seconds=round(elapsed, 2),
            data_source="live_yfinance_independent",
            data_date_range=f"{date_min} → {date_max}",
            max_return=best_return,
            max_sharpe=best_sharpe,
            min_drawdown=best_drawdown,
            buy_and_hold={"total_return": round(bh_return, 6)},
        )

        if persist:
            _save_result(result)

        _last_run_at = time.monotonic()

        if progress_cb:
            progress_cb(1.0, "Done!")

        return result
    finally:
        _OPT_LOCK.release()


def _save_result(result: OptimizationResult) -> None:
    """Atomically serialize OptimizationResult to live_optimal_params.json."""
    payload = {
        "generated_at":       time.strftime("%Y-%m-%d %H:%M:%S"),
        "status":             result.status,
        "total_combinations": result.total_combinations,
        "elapsed_seconds":    result.elapsed_seconds,
        "data_source":        result.data_source,
        "data_date_range":    result.data_date_range,
        "max_return":         result.max_return,
        "max_sharpe":         result.max_sharpe,
        "min_drawdown":       result.min_drawdown,
        "buy_and_hold":       result.buy_and_hold,
    }
    LIVE_PARAMS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=LIVE_PARAMS_PATH.parent,
            prefix=".live_params_",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            tmp_path = tmp.name
            json.dump(payload, tmp, indent=2)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_path, LIVE_PARAMS_PATH)
    except OSError:
        if tmp_path is not None and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        raise


def load_live_params() -> dict | None:
    """Load live_optimal_params.json if it exists and is valid JSON object, else return None."""
    if not LIVE_PARAMS_PATH.exists():
        return None
    try:
        with open(LIVE_PARAMS_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        logger.warning("Failed to load live params from %s: %s", LIVE_PARAMS_PATH, exc)
        return None
    if not isinstance(data, dict):
        logger.warning("Ignoring non-object JSON payload in %s", LIVE_PARAMS_PATH)
        return None
    return data
