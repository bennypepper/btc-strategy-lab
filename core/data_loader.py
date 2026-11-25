"""
core/data_loader.py
===================
Data loading helpers with Streamlit cache decorators.
All paths are relative to the repo root (data/).

Methodology update (2026-04-27):
  fetch_cbbi_live() has been replaced with fetch_live_dataset().
  Live data is now sourced entirely from yfinance BTC-USD prices.
  The Trolololo indicator is computed independently via compute_trolololo()
  (core/trolololo.py), eliminating dependency on the CBBI API and
  Index Revision Bias.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st
import yfinance as yf

from core.trolololo import compute_trolololo

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = _ROOT / "data" / "master_dataset.parquet"
RESULTS_PATH = _ROOT / "data" / "optimal_params_summary.json"
RESEARCH_DIR = _ROOT / "data" / "research"
TRIAL_LOG_DIR = _ROOT / "data" / "trial_log"

SCENARIO_1_LOG = TRIAL_LOG_DIR / "scenario_1_grid_search_in_sample.parquet"
SCENARIO_2_LOG = TRIAL_LOG_DIR / "scenario_2_grid_search_full.parquet"

ALLOWED_TRIAL_METRICS = {
    "total_return",
    "max_drawdown",
    "sharpe_ratio",
    "win_rate",
    "trade_count",
}


@st.cache_data(show_spinner=False)
def load_static_dataset() -> pd.DataFrame:
    """Load the frozen static master dataset with a normalized DatetimeIndex."""
    df_static = pd.read_parquet(DATASET_PATH)
    if not isinstance(df_static.index, pd.DatetimeIndex):
        df_static.index = pd.to_datetime(df_static.index)
    if df_static.index.tz is not None:
        df_static.index = df_static.index.tz_localize(None)
    df_static = df_static.sort_index()
    df_static.attrs["is_live"] = False
    return df_static


@st.cache_data(ttl=300, show_spinner=False)  # Cache for 5 minutes (for real-time updates)
def load_smart_dataset() -> pd.DataFrame:
    """
    Hybrid Data Pipeline (Smart Appending):
    1. Loads the static master_dataset.parquet (2012 to 2026-03-15).
    2. Checks the last date in the static dataset.
    3. Fetches ONLY the missing daily BTC-USD prices from Yahoo Finance up to today.
    4. Computes Trolololo for the entire combined price history instantly.
    5. Caches the result for 5 minutes.
    """
    df_static = load_static_dataset().copy()
    df_static.attrs["is_live"] = False

    last_date = df_static.index.max()
    start_fetch = (last_date + pd.Timedelta(days=1)).strftime("%Y-%m-%d")

    try:
        raw_new = yf.download(
            "BTC-USD", start=start_fetch, auto_adjust=True, progress=False, timeout=8.0
        )

        if not raw_new.empty:
            if isinstance(raw_new.columns, pd.MultiIndex):
                raw_new.columns = raw_new.columns.get_level_values(0)

            raw_new.index = pd.to_datetime(raw_new.index)
            if raw_new.index.tz is not None:
                raw_new.index = raw_new.index.tz_localize(None)
            raw_new = raw_new.sort_index()

            df_new = pd.DataFrame(index=raw_new.index)
            df_new["btc_close"] = pd.to_numeric(raw_new["Close"].squeeze(), errors="coerce")
            df_new["btc_open"] = pd.to_numeric(raw_new["Open"].squeeze(), errors="coerce")

            df_combined = pd.concat([df_static, df_new])
            df_combined = df_combined[~df_combined.index.duplicated(keep="last")].sort_index()

            # Drop non-positive or non-finite prices rather than forward-filling gaps.
            valid_prices = (
                np.isfinite(df_combined["btc_close"])
                & (df_combined["btc_close"] > 0)
                & np.isfinite(df_combined["btc_open"])
                & (df_combined["btc_open"] > 0)
            )
            df_combined = df_combined.loc[valid_prices].copy()

            df_combined["trolololo"] = compute_trolololo(df_combined["btc_close"].dropna())

            # Only forward-fill cosmetic CBBI columns; never ffill prices or trolololo.
            cosmetic_cols = [
                col
                for col in df_combined.columns
                if col not in ("btc_close", "btc_open", "trolololo")
            ]
            if cosmetic_cols:
                with pd.option_context("future.no_silent_downcasting", True):
                    df_combined[cosmetic_cols] = (
                        df_combined[cosmetic_cols].ffill().infer_objects(copy=False)
                    )

            df_combined.attrs["is_live"] = True
            return df_combined

    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as e:
        logger.warning(
            "Failed to fetch live delta data from yfinance: %s. Falling back to static dataset.",
            e,
        )

    return df_static



def get_dataset_slice(
    df: pd.DataFrame,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Return date-filtered slice of the master dataset."""
    mask = (df.index >= pd.Timestamp(start_date)) & (df.index <= pd.Timestamp(end_date))
    return df.loc[mask].copy()


@st.cache_data(show_spinner=False)
def load_research_results() -> dict:
    """Load optimal_params_summary.json (Phase 3 output)."""
    if not RESULTS_PATH.exists():
        raise FileNotFoundError(f"Research results file not found at {RESULTS_PATH}")
    with open(RESULTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@st.cache_data(ttl=1800, max_entries=1, show_spinner="Loading Scenario 1 trial log...")
def load_scenario1_log(columns: list[str] | None = None) -> pd.DataFrame:
    """Load Scenario 1 (IS) trial log. Cached with bounded TTL."""
    if not SCENARIO_1_LOG.exists():
        raise FileNotFoundError(
            f"Scenario 1 trial log not found at {SCENARIO_1_LOG}. "
            f"Use pre-aggregated artifacts in {RESEARCH_DIR}."
        )
    return pd.read_parquet(SCENARIO_1_LOG, columns=columns)


@st.cache_data(ttl=1800, max_entries=1, show_spinner="Loading Scenario 2 trial log...")
def load_scenario2_log(columns: list[str] | None = None) -> pd.DataFrame:
    """Load Scenario 2 (Full) trial log. Cached with bounded TTL."""
    if not SCENARIO_2_LOG.exists():
        raise FileNotFoundError(
            f"Scenario 2 trial log not found at {SCENARIO_2_LOG}. "
            f"Use pre-aggregated artifacts in {RESEARCH_DIR}."
        )
    return pd.read_parquet(SCENARIO_2_LOG, columns=columns)


def _scenario_log_path(scenario: int) -> Path:
    if scenario == 1:
        return SCENARIO_1_LOG
    if scenario == 2:
        return SCENARIO_2_LOG
    raise ValueError(f"Unsupported scenario: {scenario}. Expected 1 or 2.")


def _validate_scenario_and_metric(scenario: int, metric: str) -> Path:
    """Validate scenario (1 or 2) and metric, returning the raw trial log fallback path."""
    if metric not in ALLOWED_TRIAL_METRICS:
        raise ValueError(f"Unsupported metric: {metric}")
    return _scenario_log_path(scenario)


@st.cache_data(ttl=1800, max_entries=1, show_spinner=False)
def load_heatmap_pivot(scenario: int, metric: str = "total_return") -> pd.DataFrame:
    """
    Load the pre-aggregated sensitivity heatmap matrix from `data/research/`,
    falling back to raw trial logs if present on disk.
    """
    fallback_path = _validate_scenario_and_metric(scenario, metric)
    preagg_path = RESEARCH_DIR / f"s{scenario}_heatmap_{metric}.parquet"
    if preagg_path.exists():
        return pd.read_parquet(preagg_path)
    if fallback_path.exists():
        df_cols = pd.read_parquet(
            fallback_path, columns=["threshold_buy", "threshold_sell", metric]
        )
        return build_heatmap_matrix(df_cols, metric=metric)
    raise FileNotFoundError(
        f"Heatmap artifact not found at {preagg_path} and fallback log missing at {fallback_path}."
    )


@st.cache_data(ttl=1800, max_entries=1, show_spinner=False)
def load_top100_trials(scenario: int, metric: str = "total_return") -> pd.DataFrame:
    """
    Load the pre-aggregated Top-100 trials CSV from `data/research/`,
    falling back to raw trial logs if present on disk.
    """
    fallback_path = _validate_scenario_and_metric(scenario, metric)
    candidates = [RESEARCH_DIR / f"s{scenario}_top100_{metric}.csv"]
    if metric == "total_return":
        candidates.append(RESEARCH_DIR / f"s{scenario}_top100_max_return.csv")
    for csv_path in candidates:
        if csv_path.exists():
            return pd.read_csv(csv_path)
    if fallback_path.exists():
        df_log = pd.read_parquet(fallback_path)
        return df_log.nlargest(100, metric).reset_index(drop=True)
    raise FileNotFoundError(
        f"Top-100 artifact not found in {RESEARCH_DIR} and fallback log missing at {fallback_path}."
    )


def build_heatmap_matrix(
    trial_log: pd.DataFrame,
    metric: str = "total_return",
) -> pd.DataFrame:
    """
    Aggregate trial log into a (buy_threshold x sell_threshold) pivot matrix
    by taking the max of `metric` across all allocation combinations.

    Returns a DataFrame suitable for px.imshow().
    Rows = sell threshold (55–100), Columns = buy threshold (1–45).
    """
    buy_col  = "threshold_buy"
    sell_col = "threshold_sell"

    pivot = (
        trial_log
        .groupby([buy_col, sell_col])[metric]
        .max()
        .reset_index()
        .pivot(index=sell_col, columns=buy_col, values=metric)
        .sort_index(ascending=False)   # sell threshold: high at top
    )
    return pivot


def get_dataset_date_range(df: pd.DataFrame) -> tuple[str, str]:
    """Return (min_date_str, max_date_str) of the dataset."""
    return str(df.index.min().date()), str(df.index.max().date())
