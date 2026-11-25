"""
core/engine.py
==============
Backtest engine adapted from the core research repository/src/optimization/engine.py.

Two primary interfaces:
  - run_backtest_numba() : JIT-compiled, returns scalar performance metrics.
  - run_backtest_full()  : High-trace simulation returning SimulationResult with
                           portfolio history, trade log, and structured metrics.

Anti-Lookahead Bias Rule (strictly enforced):
  - Signal    <- trolololo[T]     (close of day T)
  - Execution <- btc_open[T+1]    (open of day T+1)
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from numba import njit

from core.models import (
    BacktestParameters,
    BenchmarkMetrics,
    SimulationResult,
    StrategyMetrics,
)

# ── Numba JIT engine ─────────────────────────────────────────────────────────


@njit
def run_backtest_numba(
    signals: np.ndarray,
    prices_open: np.ndarray,
    prices_close: np.ndarray,
    threshold_buy: int,
    threshold_sell: int,
    alloc_buy_pct: float,
    alloc_sell_pct: float,
    initial_cash: float = 100_000.0,
    fee_rate: float = 0.001,
):
    """
    Numba JIT-compiled backtest loop (C-level performance).

    Parameters
    ----------
    signals       : daily Trolololo values [0-100]
    prices_open   : daily BTC open prices (execution T+1)
    prices_close  : daily BTC close prices (signal evaluation)
    threshold_buy : signal <= threshold_buy  -> BUY
    threshold_sell: signal >= threshold_sell -> SELL
    alloc_buy_pct : fraction of cash to deploy per BUY (0.01-1.0)
    alloc_sell_pct: fraction of BTC to sell per SELL (0.01-1.0)
    initial_cash  : starting USD balance
    fee_rate      : trading fee per transaction (0.001 = 0.1%)

    Returns
    -------
    tuple: (total_return, max_drawdown, sharpe_ratio, wins, sell_count, trade_count)
    """
    n_days = len(signals)
    if n_days < 2:
        raise ValueError("Insufficient data points for backtesting (need at least 2).")
    if len(prices_open) != n_days or len(prices_close) != n_days:
        raise ValueError("signals, prices_open, and prices_close must have equal length.")
    if threshold_buy >= threshold_sell:
        raise ValueError("threshold_buy must be strictly less than threshold_sell.")
    if not np.isfinite(alloc_buy_pct) or not (0.0 < alloc_buy_pct <= 1.0):
        raise ValueError("alloc_buy_pct must be finite and in (0.0, 1.0].")
    if not np.isfinite(alloc_sell_pct) or not (0.0 < alloc_sell_pct <= 1.0):
        raise ValueError("alloc_sell_pct must be finite and in (0.0, 1.0].")
    if not np.isfinite(initial_cash) or initial_cash <= 0.0:
        raise ValueError("initial_cash must be finite and strictly positive.")
    if not np.isfinite(fee_rate) or not (0.0 <= fee_rate <= 0.10):
        raise ValueError("fee_rate must be finite and in [0.0, 0.10].")

    for i in range(n_days):
        if not np.isfinite(prices_open[i]) or prices_open[i] <= 0.0:
            raise ValueError("prices_open must contain only finite, strictly positive values.")
        if not np.isfinite(prices_close[i]) or prices_close[i] <= 0.0:
            raise ValueError("prices_close must contain only finite, strictly positive values.")
        if not np.isfinite(signals[i]):
            raise ValueError("signals must contain only finite values.")

    cash = initial_cash
    btc = 0.0
    trade_count = 0
    wins = 0
    sell_count = 0

    portfolio_value = np.zeros(n_days, dtype=np.float64)
    daily_returns = np.zeros(n_days, dtype=np.float64)

    avg_entry_price = 0.0
    portfolio_value[0] = initial_cash

    for i in range(n_days - 1):
        sig = signals[i]
        p_exec = prices_open[i + 1]   # T+1 open - execution price
        p_close = prices_close[i]     # T close - valuation

        curr_val = cash + (btc * p_close)
        portfolio_value[i] = curr_val
        if i > 0:
            prev = portfolio_value[i - 1]
            daily_returns[i] = (curr_val - prev) / prev if prev > 0 else 0.0

        if sig <= threshold_buy:
            trade_amount = cash * alloc_buy_pct
            if trade_amount > 1.0:  # Minimum $1 guard - prevents dust buys
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
            btc_sold = btc * alloc_sell_pct
            if btc_sold > 0.000001:  # Minimum BTC dust guard
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

    # Final day valuation
    portfolio_value[n_days - 1] = cash + (btc * prices_close[n_days - 1])
    prev = portfolio_value[n_days - 2] if n_days >= 2 else initial_cash
    daily_returns[n_days - 1] = (
        (portfolio_value[n_days - 1] - prev) / prev if prev > 0 else 0.0
    )

    # ── Metrics ──────────────────────────────────────────────────────────────
    total_return = (portfolio_value[-1] - initial_cash) / initial_cash

    max_drawdown = 0.0
    peak = portfolio_value[0]
    for i in range(n_days):
        peak = max(peak, portfolio_value[i])
        dd = (peak - portfolio_value[i]) / peak if peak > 0 else 0.0
        max_drawdown = max(max_drawdown, dd)

    # Evaluate returns across actual inter-day steps (exclude day 0 uncomputed slot)
    returns_slice = daily_returns[1:] if n_days > 1 else daily_returns
    mean_ret = np.mean(returns_slice)
    std_ret = np.std(returns_slice)
    rf_daily = 0.04 / 365.0
    sharpe_ratio = 0.0
    if std_ret > 0:
        sharpe_ratio = ((mean_ret - rf_daily) / std_ret) * np.sqrt(365.0)

    return total_return, max_drawdown, sharpe_ratio, wins, sell_count, trade_count


# ── Full trace engine (Python-level) ─────────────────────────────────────────

def _compute_strategy_metrics(
    pv: np.ndarray,
    dr: np.ndarray,
    dates: pd.DatetimeIndex,
    initial_cash: float,
    trade_count: int,
    sell_count: int,
    wins: int,
    cash_final: float,
    btc_final: float,
) -> StrategyMetrics:
    """Pure helper function to compute metrics for active strategy."""
    total_return = (pv[-1] - initial_cash) / initial_cash

    max_drawdown = 0.0
    max_drawdown_idx = 0
    peak = pv[0]
    for i in range(len(pv)):
        peak = max(peak, pv[i])
        dd = (peak - pv[i]) / peak if peak > 0 else 0.0
        if dd > max_drawdown:
            max_drawdown = dd
            max_drawdown_idx = i

    max_drawdown_date = str(dates[max_drawdown_idx].date()) if len(dates) > max_drawdown_idx else ""
    buy_count = trade_count - sell_count

    # Inter-day returns excluding day 0
    returns_slice = dr[1:] if len(dr) > 1 else dr
    mean_ret = float(np.mean(returns_slice))
    std_ret = float(np.std(returns_slice))
    rf_daily = 0.04 / 365.0
    sharpe_ratio = 0.0
    if std_ret > 0:
        sharpe_ratio = ((mean_ret - rf_daily) / std_ret) * np.sqrt(365.0)

    win_rate = float(wins) / sell_count if sell_count > 0 else 0.0

    return StrategyMetrics(
        total_return=float(total_return),
        max_drawdown=float(max_drawdown),
        max_drawdown_date=max_drawdown_date,
        sharpe_ratio=float(sharpe_ratio),
        win_rate=float(win_rate),
        trade_count=int(trade_count),
        buy_count=int(buy_count),
        sell_count=int(sell_count),
        final_cash=float(cash_final),
        final_btc=float(btc_final),
        final_portfolio_value=float(pv[-1]),
    )


def _compute_benchmark_metrics(
    prices_open: np.ndarray,
    prices_close: np.ndarray,
    initial_cash: float,
    fee_rate: float,
) -> tuple[np.ndarray, BenchmarkMetrics]:
    """Pure helper function to compute Buy & Hold benchmark history and metrics."""
    bh_btc = (initial_cash * (1.0 - fee_rate)) / prices_open[0]
    bh_values = bh_btc * prices_close
    bh_return = (bh_values[-1] - initial_cash) / initial_cash

    bh_daily_ret = np.diff(prices_close) / prices_close[:-1]

    bh_mdd = 0.0
    bh_peak = prices_close[0]
    for p in prices_close:
        bh_peak = max(bh_peak, p)
        bh_dd = (bh_peak - p) / bh_peak if bh_peak > 0 else 0.0
        bh_mdd = max(bh_mdd, bh_dd)

    bh_mean = float(np.mean(bh_daily_ret))
    bh_std = float(np.std(bh_daily_ret))
    rf_daily = 0.04 / 365.0
    bh_sharpe = ((bh_mean - rf_daily) / bh_std * np.sqrt(365.0)) if bh_std > 0 else 0.0

    metrics = BenchmarkMetrics(
        total_return=float(bh_return),
        max_drawdown=float(bh_mdd),
        sharpe_ratio=float(bh_sharpe),
        final_value=float(bh_values[-1]),
    )
    return bh_values, metrics


def run_backtest_full(
    df: pd.DataFrame,
    threshold_buy: int,
    threshold_sell: int,
    alloc_buy_pct: float,
    alloc_sell_pct: float,
    initial_cash: float = 100_000.0,
    fee_rate: float = 0.001,
    signal_column: str = "trolololo",
) -> SimulationResult:
    """
    Full-trace backtest simulation tracking per-day portfolio state and trade logs.
    Adheres strictly to the Single Level of Abstraction Principle (SLAP).
    """
    params = BacktestParameters(
        threshold_buy=int(threshold_buy),
        threshold_sell=int(threshold_sell),
        alloc_buy_pct=float(alloc_buy_pct),
        alloc_sell_pct=float(alloc_sell_pct),
        initial_cash=float(initial_cash),
        fee_rate=float(fee_rate),
        signal_column=signal_column,
    )
    if not np.isfinite(params.initial_cash):
        raise ValueError(f"initial_cash ({params.initial_cash}) must be finite and positive")

    clean_df = df.dropna(subset=[params.signal_column, "btc_open", "btc_close"]).copy()
    n = len(clean_df)
    if n < 2:
        raise ValueError("Insufficient data points for backtesting (need at least 2).")

    signals = clean_df[params.signal_column].values.astype(np.float64)
    prices_open = clean_df["btc_open"].values.astype(np.float64)
    prices_close = clean_df["btc_close"].values.astype(np.float64)
    dates = clean_df.index

    if not (np.isfinite(prices_open).all() and (prices_open > 0.0).all()):
        raise ValueError("btc_open must contain only finite, strictly positive values.")
    if not (np.isfinite(prices_close).all() and (prices_close > 0.0).all()):
        raise ValueError("btc_close must contain only finite, strictly positive values.")
    if not np.isfinite(signals).all():
        raise ValueError(f"{params.signal_column} must contain only finite values.")

    cash = params.initial_cash
    btc = 0.0
    avg_entry_price = 0.0
    trade_count = 0
    wins = 0
    sell_count = 0

    pv = np.zeros(n, dtype=np.float64)
    cash_arr = np.zeros(n, dtype=np.float64)
    btc_arr = np.zeros(n, dtype=np.float64)
    dr = np.zeros(n, dtype=np.float64)

    trade_rows: list[dict] = []

    pv[0] = params.initial_cash
    cash_arr[0] = params.initial_cash
    btc_arr[0] = 0.0

    for i in range(n - 1):
        sig = signals[i]
        p_exec = prices_open[i + 1]   # T+1 open
        p_val = prices_close[i]       # T close for valuation

        curr_val = cash + (btc * p_val)
        pv[i] = curr_val
        cash_arr[i] = cash
        btc_arr[i] = btc

        if i > 0:
            prev = pv[i - 1]
            dr[i] = (curr_val - prev) / prev if prev > 0 else 0.0

        action = None

        if sig <= params.threshold_buy:
            trade_amount = cash * params.alloc_buy_pct
            if trade_amount > 1.0:  # Minimum $1 dust guard
                fee = trade_amount * params.fee_rate
                net_usd = trade_amount - fee
                btc_bought = net_usd / p_exec
                total_cost = (btc * avg_entry_price) + trade_amount
                btc += btc_bought
                avg_entry_price = total_cost / btc if btc > 0 else 0.0
                cash -= trade_amount
                trade_count += 1
                action = ("BUY", trade_amount, btc_bought)

        elif sig >= params.threshold_sell:
            btc_sold = btc * params.alloc_sell_pct
            if btc_sold > 0.000001:  # Minimum BTC dust guard
                gross_usd = btc_sold * p_exec
                fee = gross_usd * params.fee_rate
                net_usd = gross_usd - fee
                cost_sold = btc_sold * avg_entry_price
                cash += net_usd
                btc -= btc_sold
                trade_count += 1
                if net_usd > cost_sold:
                    wins += 1
                sell_count += 1
                action = ("SELL", gross_usd, btc_sold)

        if action is not None:
            exec_date = dates[i + 1] if i + 1 < n else dates[i]
            equity_after = cash + btc * p_exec
            trade_rows.append({
                "Date": exec_date,
                "Action": action[0],
                "BTC Price": round(p_exec, 2),
                "Amount (USD)": round(action[1], 2),
                "BTC Amount": round(action[2], 6),
                "Signal Index": round(sig, 1),
                "Cash After": round(cash, 2),
                "BTC Held After": round(btc, 6),
                "Equity After": round(equity_after, 2),
            })

    # Final day valuation
    pv[n - 1] = cash + (btc * prices_close[n - 1])
    cash_arr[n - 1] = cash
    btc_arr[n - 1] = btc
    prev = pv[n - 2] if n >= 2 else params.initial_cash
    dr[n - 1] = (pv[n - 1] - prev) / prev if prev > 0 else 0.0

    # ── Performance Metrics ──────────────────────────────────────────────────
    strategy_metrics = _compute_strategy_metrics(
        pv=pv,
        dr=dr,
        dates=dates,
        initial_cash=params.initial_cash,
        trade_count=trade_count,
        sell_count=sell_count,
        wins=wins,
        cash_final=cash_arr[-1],
        btc_final=btc_arr[-1],
    )

    bh_values, benchmark_metrics = _compute_benchmark_metrics(
        prices_open=prices_open,
        prices_close=prices_close,
        initial_cash=params.initial_cash,
        fee_rate=params.fee_rate,
    )

    # ── Portfolio history DataFrame ───────────────────────────────────────────
    portfolio_history = pd.DataFrame({
        "date": dates,
        "portfolio_value": pv,
        "cash": cash_arr,
        "btc_held": btc_arr,
        "btc_close": prices_close,
        "buy_and_hold_value": bh_values,
    }).set_index("date")

    # ── Trade log DataFrame ───────────────────────────────────────────────────
    trade_log = pd.DataFrame(trade_rows) if trade_rows else pd.DataFrame(
        columns=[
            "Date", "Action", "BTC Price", "Amount (USD)",
            "BTC Amount", "Signal Index", "Cash After",
            "BTC Held After", "Equity After",
        ]
    )

    return SimulationResult(
        portfolio_history=portfolio_history,
        trade_log=trade_log,
        metrics=strategy_metrics,
        benchmark_metrics=benchmark_metrics,
        low_sample_warning=(trade_count < 10),
        params=params,
    )


def warmup_numba() -> None:
    """Pre-compile Numba JIT function on app startup to eliminate user-facing delay."""
    dummy = np.ones(100, dtype=np.float64)
    run_backtest_numba(dummy, dummy, dummy, 20, 75, 0.10, 0.10, 100_000.0, 0.001)
