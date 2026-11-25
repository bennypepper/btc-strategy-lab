"""
core/trolololo.py
=================
Independent computation of the Trolololo (Logarithmic Regression Trend) indicator.

Background
----------
Trolololo models Bitcoin's long-term price growth as a power law over time.
It answers: "Is Bitcoin currently expensive or cheap relative to its historical
growth curve?" — expressed as a 0-100 score.

Method: Dynamic Channel Normalization (original formula, confirmed 2026-04-28)
----------------------------------------------------------------------------------
The indicator uses two separate power-law base channels (top and bottom) derived
from Bitcoin's known cycle structure, then fits linear regressions on the residuals
at confirmed cycle peaks (highs) and cycle troughs (lows). This produces an adaptive
channel that accounts for Bitcoin's diminishing cycle amplitude over time.

Formula (natural log space):
    d           = days since 2012-01-01
    price_log   = ln(price)
    top_base    = ln(10) * (2.900 * ln(d + 1400) - 19.463)
    bottom_base = ln(10) * (2.788 * ln(d + 1200) - 19.463)

    res_top    = price_log - top_base    (residual at cycle peaks)
    res_bottom = price_log - bottom_base (residual at cycle troughs)

    top_drift    = linreg(d[hi_indices], res_top[hi_indices])    evaluated at d[valid]
    bottom_drift = linreg(d[lo_indices], res_bottom[lo_indices]) evaluated at d[valid]

    channel_top    = top_base    + top_drift
    channel_bottom = bottom_base + bottom_drift

    index = clip((price_log - channel_bottom) / (channel_top - channel_bottom), 0, 1) * 100

Cycle marks strategy
--------------------
- Pre-2026: Hardcoded confirmed historical BTC cycle peaks and troughs (ground truth).
- Post-2026: Detected algorithmically using local extrema over a rolling window.

Why independent calculation?
-----------------------------
CBBI's published Trolololo values are subject to retroactive revision whenever
Colin updates the index formula ("Index Revision Bias"). By computing this
indicator directly from BTC price data using a fixed formula, the result is
deterministic and reproducible regardless of third-party index changes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from scipy.signal import argrelextrema

# ── Origin date ───────────────────────────────────────────────────────────────

# Day-counting origin. The formula uses 2012-01-01 as reference.
ORIGIN_DATE = pd.Timestamp("2012-01-01")

# ── Base channel constants (original formula) ─────────────────────────────────

# top_base    = ln(10) * (TOP_SLOPE    * ln(d + TOP_OFFSET)    - INTERCEPT)
# bottom_base = ln(10) * (BOTTOM_SLOPE * ln(d + BOTTOM_OFFSET) - INTERCEPT)
TOP_SLOPE:      float = 2.900
TOP_OFFSET:     int   = 1400
BOTTOM_SLOPE:   float = 2.788
BOTTOM_OFFSET:  int   = 1200
INTERCEPT:      float = 19.463

# Correction factor applied to the residual at the FIRST confirmed high mark.
# Source: original implementation (manual calibration for early 2013 bubble).
FIRST_HIGH_CORRECTION: float = 0.6

# ── Confirmed historical BTC cycle marks (ground truth, pre-2026) ─────────────

# Major confirmed CYCLE PEAKS (price highs) used as top-channel calibration points.
# Note: yfinance BTC-USD data only starts from 2014-09-17, so the 2013 peaks
# are outside the available range and will be silently skipped. The channel
# regression then runs on the 2017 and 2021 peaks only (still valid).
CONFIRMED_HIGHS: list[str] = [
    "2013-04-09",   # First major bubble peak  (~$266)   [pre-yfinance, skipped]
    "2013-11-30",   # Second 2013 peak         (~$1,163)  [pre-yfinance, skipped]
    "2017-12-17",   # 2017 bull market peak    (~$19,783)
    "2021-11-10",   # 2021 all-time high       (~$68,789)
]

# Major confirmed CYCLE TROUGHS (price lows) used as bottom-channel calibration.
# Note: 2012-11-18 may be outside yfinance range (starts 2014-09-17) and will
# be silently skipped.
CONFIRMED_LOWS: list[str] = [
    "2012-11-18",   # 2012 bear bottom         (~$4)      [pre-yfinance, may skip]
    "2015-01-14",   # 2014-2015 bear bottom    (~$152)
    "2018-12-15",   # 2018 bear bottom         (~$3,122)
    "2022-11-21",   # 2022 bear bottom         (~$15,742)
]

# Cutoff beyond which algorithmic detection is used instead of hardcoded marks.
MARKS_CUTOFF_DATE = pd.Timestamp("2026-01-01")

# Window (in days) for algorithmic local extrema detection beyond MARKS_CUTOFF_DATE.
ALGO_EXTREMA_WINDOW: int = 365


# ── Cycle mark helpers ────────────────────────────────────────────────────────

def _nearest_index(dates: pd.DatetimeIndex, date_str: str) -> int:
    """Return the integer position of the date nearest to date_str in dates."""
    ts = pd.Timestamp(date_str)
    return int(dates.get_indexer([ts], method="nearest")[0])


def get_cycle_marks(
    btc_close: pd.Series,
    algo_window: int = ALGO_EXTREMA_WINDOW,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build boolean arrays marking BTC cycle peaks (high_marks) and troughs (low_marks).

    Strategy
    --------
    For dates within MARKS_CUTOFF_DATE (before 2026):
        Use CONFIRMED_HIGHS / CONFIRMED_LOWS — hardcoded ground truth.
    For dates beyond MARKS_CUTOFF_DATE:
        Detect algorithmically using argrelextrema on ln(price) with the
        given window (default: must be local max/min within ±365 days).

    Parameters
    ----------
    btc_close   : BTC daily closing prices with DatetimeIndex.
    algo_window : Order parameter for scipy.signal.argrelextrema (days each side).

    Returns
    -------
    high_marks, low_marks : boolean np.ndarrays of shape (len(btc_close),)
    """
    n = len(btc_close)
    dates = btc_close.index
    high_marks = np.zeros(n, dtype=bool)
    low_marks  = np.zeros(n, dtype=bool)

    # 1. Hardcoded historical marks
    for d in CONFIRMED_HIGHS:
        ts = pd.Timestamp(d)
        if ts >= dates[0] and ts <= dates[-1]:
            high_marks[_nearest_index(dates, d)] = True

    for d in CONFIRMED_LOWS:
        ts = pd.Timestamp(d)
        if ts >= dates[0] and ts <= dates[-1]:
            low_marks[_nearest_index(dates, d)] = True

    # 2. Algorithmic detection beyond cutoff
    if dates.max() > MARKS_CUTOFF_DATE:
        cutoff_pos = int(dates.searchsorted(MARKS_CUTOFF_DATE))
        prices = btc_close.values.astype(float)
        log_prices = np.full(n, np.nan, dtype=float)
        pos_mask = (prices > 0.0) & np.isfinite(prices)
        log_prices[pos_mask] = np.log(prices[pos_mask])

        # Fill NaN for extrema detection (forward fill is safe here — for mark detection only)
        log_prices_filled = pd.Series(log_prices).ffill().values

        if algo_window < n:
            algo_highs = argrelextrema(log_prices_filled, np.greater, order=algo_window)[0]
            algo_lows  = argrelextrema(log_prices_filled, np.less,    order=algo_window)[0]

            for idx in algo_highs:
                if idx >= cutoff_pos:
                    high_marks[idx] = True
            for idx in algo_lows:
                if idx >= cutoff_pos:
                    low_marks[idx] = True

    return high_marks, low_marks


# ── Shared internal channel computation ───────────────────────────────────────

def _compute_channel_log(
    btc_close: pd.Series,
    algo_window: int = ALGO_EXTREMA_WINDOW,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute natural-log price and adaptive (channel_top, channel_bottom) arrays.

    Uses calendar days since ORIGIN_DATE (`d_raw`) as the independent variable for
    both base power-law channels and OLS drift regressions so series starting on
    different dates or containing gaps share identical time scaling.

    Returns
    -------
    (price_log, channel_top, channel_bottom, valid)
    """
    if not isinstance(btc_close.index, pd.DatetimeIndex):
        raise TypeError("btc_close must have a DatetimeIndex.")

    n = len(btc_close)
    dates = btc_close.index
    prices = btc_close.values.astype(float)

    d_raw = (dates - ORIGIN_DATE).days.values.astype(float)
    valid = (d_raw > 0) & (prices > 0) & np.isfinite(prices)

    if valid.sum() < 10:
        raise ValueError("Insufficient valid data points (need >= 10).")

    price_log = np.full(n, np.nan, dtype=float)
    price_log[valid] = np.log(prices[valid])

    ln10 = np.log(10.0)
    top_base = np.full(n, np.nan, dtype=float)
    bottom_base = np.full(n, np.nan, dtype=float)
    top_base[valid] = ln10 * (TOP_SLOPE * np.log(d_raw[valid] + TOP_OFFSET) - INTERCEPT)
    bottom_base[valid] = ln10 * (BOTTOM_SLOPE * np.log(d_raw[valid] + BOTTOM_OFFSET) - INTERCEPT)

    res_top = price_log - top_base
    res_bottom = price_log - bottom_base

    high_marks, low_marks = get_cycle_marks(btc_close, algo_window=algo_window)
    hi_idx = np.where(high_marks)[0]
    lo_idx = np.where(low_marks)[0]
    hi_idx = hi_idx[np.isfinite(res_top[hi_idx])]
    lo_idx = lo_idx[np.isfinite(res_bottom[lo_idx])]

    if len(hi_idx) < 2 or len(lo_idx) < 2:
        return price_log, top_base, bottom_base, valid

    hi_y = res_top[hi_idx].copy()
    hi_y[0] *= FIRST_HIGH_CORRECTION
    slope_top, intercept_top, _, _, _ = stats.linregress(d_raw[hi_idx], hi_y)
    top_drift = np.full(n, np.nan, dtype=float)
    top_drift[valid] = slope_top * d_raw[valid] + intercept_top

    lo_y = res_bottom[lo_idx].copy()
    slope_bot, intercept_bot, _, _, _ = stats.linregress(d_raw[lo_idx], lo_y)
    bottom_drift = np.full(n, np.nan, dtype=float)
    bottom_drift[valid] = slope_bot * d_raw[valid] + intercept_bot

    channel_top = top_base + top_drift
    channel_bottom = bottom_base + bottom_drift
    return price_log, channel_top, channel_bottom, valid


# ── Core computation ──────────────────────────────────────────────────────────

def compute_trolololo(
    btc_close: pd.Series,
    algo_window: int = ALGO_EXTREMA_WINDOW,
) -> pd.Series:
    """
    Compute the Trolololo indicator from BTC daily closing prices.

    Uses the Dynamic Channel Normalization formula (confirmed 2026-04-28):
    - Two power-law base channels (top and bottom) in natural-log space
    - Linear drift regression fit at confirmed cycle peaks and troughs over calendar days
    - Adaptive channel = base + drift
    - Normalization: (price_log - channel_bottom) / (channel_top - channel_bottom)

    Parameters
    ----------
    btc_close  : pd.Series
        Daily BTC-USD closing prices with a DatetimeIndex.
        Should span from at least 2012-01-01 for stable channel regression.
    algo_window : int
        Days window for algorithmic extrema detection beyond 2026-01-01.

    Returns
    -------
    pd.Series
        Trolololo values in [0, 100], same DatetimeIndex as input.
        NaN for rows where price is zero/negative or d <= 0.
    """
    price_log, channel_top, channel_bottom, valid = _compute_channel_log(
        btc_close, algo_window=algo_window
    )
    channel_range = channel_top - channel_bottom

    raw = np.full(len(btc_close), np.nan, dtype=float)
    mask = valid & (channel_range > 1e-6)
    raw[mask] = (price_log[mask] - channel_bottom[mask]) / channel_range[mask]

    return pd.Series(
        np.where(np.isfinite(raw), np.clip(raw, 0.0, 1.0) * 100.0, np.nan),
        index=btc_close.index,
        dtype=float,
        name="trolololo",
    )


def compute_trolololo_bands(
    btc_close: pd.Series,
    algo_window: int = ALGO_EXTREMA_WINDOW,
) -> tuple[pd.Series, pd.Series]:
    """
    Compute the adaptive Trolololo upper and lower channel bands in USD price space.

    Parameters
    ----------
    btc_close   : Daily BTC-USD closing prices with a DatetimeIndex.
    algo_window : Days window for algorithmic extrema detection beyond 2026-01-01.

    Returns
    -------
    (top_band, bottom_band) : tuple of pd.Series in USD price space with btc_close.index.
    """
    _price_log, channel_top, channel_bottom, valid = _compute_channel_log(
        btc_close, algo_window=algo_window
    )
    top_usd = np.full(len(btc_close), np.nan, dtype=float)
    bottom_usd = np.full(len(btc_close), np.nan, dtype=float)
    top_usd[valid] = np.exp(channel_top[valid])
    bottom_usd[valid] = np.exp(channel_bottom[valid])

    top_band = pd.Series(top_usd, index=btc_close.index, dtype=float, name="top_band")
    bottom_band = pd.Series(bottom_usd, index=btc_close.index, dtype=float, name="bottom_band")
    return top_band, bottom_band


# ── Diagnostics ───────────────────────────────────────────────────────────────

def get_channel_params(btc_close: pd.Series) -> dict:
    """
    Return the fitted channel regression parameters for inspection.

    Useful for verifying the drift regressions are stable and the
    adaptive channel correctly brackets historical cycle extremes.
    """
    high_marks, low_marks = get_cycle_marks(btc_close)
    n      = len(btc_close)
    dates  = btc_close.index
    prices = btc_close.values.astype(float)
    d_raw  = (dates - ORIGIN_DATE).days.values.astype(float)
    valid  = (d_raw > 0) & (prices > 0) & np.isfinite(prices)

    ln10 = np.log(10.0)
    price_log   = np.full(n, np.nan, dtype=float)
    top_base    = np.full(n, np.nan, dtype=float)
    bottom_base = np.full(n, np.nan, dtype=float)
    price_log[valid]   = np.log(prices[valid])
    top_base[valid]    = ln10 * (TOP_SLOPE    * np.log(d_raw[valid] + TOP_OFFSET)    - INTERCEPT)
    bottom_base[valid] = ln10 * (BOTTOM_SLOPE * np.log(d_raw[valid] + BOTTOM_OFFSET) - INTERCEPT)

    res_top    = price_log - top_base
    res_bottom = price_log - bottom_base

    hi_idx = np.where(high_marks)[0]
    hi_idx = hi_idx[np.isfinite(res_top[hi_idx])]
    lo_idx = np.where(low_marks)[0]
    lo_idx = lo_idx[np.isfinite(res_bottom[lo_idx])]

    hi_y = res_top[hi_idx].copy()
    if len(hi_y):
        hi_y[0] *= FIRST_HIGH_CORRECTION

    result = {
        "origin_date":          str(ORIGIN_DATE.date()),
        "n_high_marks":         len(hi_idx),
        "n_low_marks":          len(lo_idx),
        "high_mark_dates":      [str(dates[i].date()) for i in hi_idx],
        "low_mark_dates":       [str(dates[i].date()) for i in lo_idx],
    }

    if len(hi_idx) >= 2:
        s, i, r, _, _ = stats.linregress(d_raw[hi_idx], hi_y)
        result.update({
            "top_drift_slope": round(s, 8),
            "top_drift_intercept": round(i, 6),
            "top_r_squared": round(r**2, 4),
        })

    if len(lo_idx) >= 2:
        s, i, r, _, _ = stats.linregress(d_raw[lo_idx], res_bottom[lo_idx])
        result.update({
            "bottom_drift_slope": round(s, 8),
            "bottom_drift_intercept": round(i, 6),
            "bottom_r_squared": round(r**2, 4),
        })

    return result


def validate_against_reference(
    btc_close: pd.Series,
    reference_date: str = "2026-04-27",
    reference_value: float | None = None,
    tolerance: float = 5.0,
) -> dict:
    """
    Compute Trolololo on a reference date and report the result.

    With the dynamic channel formula, there is no single fixed reference value
    to calibrate against — the formula IS the calibration. This function is
    used to inspect the current value and confirm it is in a plausible range.

    Parameters
    ----------
    btc_close       : Full BTC price history.
    reference_date  : Date to inspect.
    reference_value : Optional expected value for pass/fail check.
                      If None, just reports the computed value.
    tolerance       : Acceptable absolute difference if reference_value is set.
    """
    trololo = compute_trolololo(btc_close)

    try:
        computed = float(trololo.loc[reference_date])
    except KeyError:
        ts  = pd.Timestamp(reference_date)
        idx = trololo.index.get_indexer([ts], method="nearest")[0]
        computed       = float(trololo.iloc[idx])
        reference_date = str(trololo.index[idx].date())

    out: dict = {
        "date":     reference_date,
        "computed": round(computed, 2),
        "method":   "dynamic_channel_normalization",
    }

    if reference_value is not None:
        diff = abs(computed - reference_value)
        out.update({
            "reference":  reference_value,
            "difference": round(diff, 2),
            "tolerance":  tolerance,
            "passed":     diff <= tolerance,
            "status":     "PASS" if diff <= tolerance else "FAIL",
        })

    return out
