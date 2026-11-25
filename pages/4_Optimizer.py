"""
pages/4_Optimizer.py
====================
Dynamic Grid Search Optimizer — Live Parameter Updater.

This page runs a Numba-accelerated grid search over live BTC price data
(fetched from Yahoo Finance) with Trolololo computed independently via
logarithmic regression. This eliminates dependence on the CBBI API and
resolves the "Index Revision Bias" documented in our research limitations.
"""

from __future__ import annotations

import datetime as _dt
import hmac
import html
import logging
import os

import streamlit as st
from streamlit.errors import StreamlitAPIException

from core.data_loader import load_smart_dataset
from core.optimizer import (
    ALLOC_STEPS,
    BUY_THRESHOLDS,
    SELL_THRESHOLDS,
    load_live_params,
    run_live_optimization,
    warmup_optimizer,
)
from core.styles import inject_css

logger = logging.getLogger(__name__)

# Pre-compute total combinations for display
n_combos = len(BUY_THRESHOLDS) * len(SELL_THRESHOLDS) * len(ALLOC_STEPS) ** 2

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Optimizer: BTC Strategy Lab",
    page_icon="⚙️",
    layout="wide",
)
inject_css()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _get_admin_passcode() -> str | None:
    """Return admin passcode from env var or Streamlit Secrets, or None if unset."""
    env_val = os.environ.get("BTC_LAB_ADMIN_PASSCODE", "").strip()
    if env_val:
        return env_val
    try:
        secret_val = st.secrets.get("ADMIN_PASSCODE")
    except (FileNotFoundError, KeyError, OSError, StreamlitAPIException):
        # st.secrets raises FileNotFoundError/StreamlitSecretNotFoundError when no secrets.toml exists
        return None
    if secret_val is not None:
        stripped = str(secret_val).strip()
        if stripped:
            return stripped
    return None


def _fmt_pct(v: float) -> str:
    sign = "+" if v >= 0 else ""
    return f"{sign}{v * 100:.1f}%"


def _fmt_dd(v: float) -> str:
    # Always display drawdown as negative for visual consistency
    return f"-{abs(v) * 100:.1f}%"


def _result_to_display_dict(res) -> dict:
    return {
        "generated_at": _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": res.status,
        "total_combinations": res.total_combinations,
        "elapsed_seconds": res.elapsed_seconds,
        "data_source": res.data_source,
        "data_date_range": res.data_date_range,
        "max_return": res.max_return,
        "max_sharpe": res.max_sharpe,
        "min_drawdown": res.min_drawdown,
        "buy_and_hold": res.buy_and_hold,
    }


# ── Page header ───────────────────────────────────────────────────────────────

st.markdown(
    """
<div style="margin-bottom:1.5rem">
  <div style="font-size:0.78rem;font-weight:700;letter-spacing:0.14em;
              text-transform:uppercase;color:var(--accent);margin-bottom:0.3rem">
    BTC STRATEGY LAB
  </div>
  <h1 style="font-size:2rem;font-weight:800;margin:0 0 0.4rem 0;line-height:1.15">
    ⚙️ Dynamic Parameter Optimizer
  </h1>
  <p style="font-size:0.95rem;color:var(--muted);max-width:660px;margin:0">
    Re-optimize strategy parameters against <strong>fresh live BTC price data</strong>
    (Yahoo Finance) with the signal computed via independent logarithmic regression.
    No reliance on the CBBI API: signal values are deterministic and reproducible.
  </p>
</div>
""",
    unsafe_allow_html=True,
)

# ── Context banner ────────────────────────────────────────────────────────────

st.info(
    "📌 **Research Scope Note**: The academic backtest used a frozen snapshot. "
    "This optimizer is a *practical extension* outside that scope. "
    "Results here are for live deployment only, not for comparing against the IS/OOS research findings.",
    icon=None,
)

st.markdown("---")

# ── Search space summary ──────────────────────────────────────────────────────

col_a, col_b, col_c, col_d = st.columns(4)
with col_a:
    st.markdown(
        f"""
    <div class="metric-card">
      <div class="metric-label">Buy Thresholds</div>
      <div class="metric-value">{len(BUY_THRESHOLDS)}</div>
      <div class="metric-subtext">{BUY_THRESHOLDS[0]} → {BUY_THRESHOLDS[-1]} (step 1)</div>
    </div>""",
        unsafe_allow_html=True,
    )
with col_b:
    st.markdown(
        f"""
    <div class="metric-card">
      <div class="metric-label">Sell Thresholds</div>
      <div class="metric-value">{len(SELL_THRESHOLDS)}</div>
      <div class="metric-subtext">{SELL_THRESHOLDS[0]} → {SELL_THRESHOLDS[-1]} (step 1)</div>
    </div>""",
        unsafe_allow_html=True,
    )
with col_c:
    st.markdown(
        f"""
    <div class="metric-card">
      <div class="metric-label">Allocation Steps</div>
      <div class="metric-value">{len(ALLOC_STEPS)} × {len(ALLOC_STEPS)}</div>
      <div class="metric-subtext">Buy & Sell independently</div>
    </div>""",
        unsafe_allow_html=True,
    )
with col_d:
    st.markdown(
        f"""
    <div class="metric-card">
      <div class="metric-label">Total Combinations</div>
      <div class="metric-value">{n_combos:,}</div>
      <div class="metric-subtext">O(1)-RAM streaming Numba</div>
    </div>""",
        unsafe_allow_html=True,
    )


# ── Existing results (if any) ─────────────────────────────────────────────────

st.markdown("### 📊 Current Live Parameters")

custom_result = st.session_state.get("custom_opt_result")
existing = custom_result if custom_result and custom_result.get("status") == "success" else load_live_params()

if custom_result and custom_result.get("status") == "success":
    st.caption("Showing session-local custom optimization results (global defaults unchanged).")

if existing and existing.get("status") == "success":
    gen_at = html.escape(str(existing.get("generated_at", "Unknown")))
    date_range = html.escape(str(existing.get("data_date_range", "Unknown")))
    elapsed = html.escape(str(existing.get("elapsed_seconds", 0)))
    total_c = int(existing.get("total_combinations", 0))

    st.markdown(
        f"""
    <div class="metric-card" style="margin-bottom:1rem">
      <div class="metric-label">Last Optimization Run</div>
      <div class="metric-value" style="font-size:1.2rem">{gen_at}</div>
      <div class="metric-subtext">
        Trained on: {date_range} &nbsp;·&nbsp;
        {total_c:,} combinations &nbsp;·&nbsp;
        {elapsed}s runtime
      </div>
    </div>""",
        unsafe_allow_html=True,
    )

    mr = existing.get("max_return", {})
    ms = existing.get("max_sharpe", {})
    md = existing.get("min_drawdown", {})

    col1, col2, col3 = st.columns(3)

    for col, obj_data, obj_label, accent in [
        (col1, mr, "🏆 Max Return", "#0a7c6e"),
        (col2, ms, "📐 Max Sharpe", "#0369a1"),
        (col3, md, "🛡️ Min Drawdown", "#7c3aed"),
    ]:
        with col:
            if obj_data:
                ret_pct = html.escape(_fmt_pct(float(obj_data.get("total_return", 0))))
                t_buy = html.escape(str(obj_data.get("threshold_buy", "")))
                t_sell = html.escape(str(obj_data.get("threshold_sell", "")))
                ab_pct = float(obj_data.get("allocation_buy_pct", 0)) * 100
                as_pct = float(obj_data.get("allocation_sell_pct", 0)) * 100
                sharpe_val = float(obj_data.get("sharpe_ratio", 0))
                dd_str = html.escape(_fmt_dd(float(obj_data.get("max_drawdown", 0))))
                trades_val = int(obj_data.get("trade_count", 0))
                safe_obj_label = html.escape(obj_label)
                st.markdown(
                    f"""
                <div class="metric-card" style="border-left:4px solid {accent}">
                  <div class="metric-label">{safe_obj_label}</div>
                  <div style="margin-top:0.6rem;font-size:0.88rem;line-height:1.8">
                    <b>Buy ≤ {t_buy}</b> &nbsp;|&nbsp;
                    <b>Sell ≥ {t_sell}</b><br>
                    Alloc: {ab_pct:.0f}% buy /
                           {as_pct:.0f}% sell<br>
                    Return: <b>{ret_pct}</b> &nbsp;·&nbsp;
                    Sharpe: <b>{sharpe_val:.2f}</b><br>
                    Drawdown: <b>{dd_str}</b> &nbsp;·&nbsp;
                    Trades: <b>{trades_val}</b>
                  </div>
                </div>""",
                    unsafe_allow_html=True,
                )
else:
    st.warning(
        "No live optimization has been run yet. "
        "Click **Run Optimization** below to generate live-aligned parameters.",
        icon="⚠️",
    )


# ── Run optimizer ─────────────────────────────────────────────────────────────

st.markdown("---")
st.markdown("### 🚀 Run New Optimization")

with st.expander("⚙️ Advanced Settings", expanded=False):
    split_date = st.date_input(
        "IS/OOS Split Date (parameters optimized on IS period only)",
        value=_dt.date(2021, 1, 1),
        min_value=_dt.date(2015, 1, 1),
        max_value=_dt.date.today(),
        help="Data before this date is used for in-sample optimization. OOS data is never seen during training.",
    )
    initial_cash = st.number_input(
        "Initial Capital (USD)",
        value=100_000,
        step=10_000,
        min_value=1,
    )
    fee_rate = st.number_input(
        "Trading Fee Rate",
        value=0.001,
        step=0.0005,
        format="%.4f",
        min_value=0.0,
        max_value=0.10,
    )

st.markdown(
    f"""
    <div style="background:var(--bg-card);border:1.5px solid var(--border);
                border-radius:8px;padding:1rem 1.2rem;margin-bottom:1rem;
                font-size:0.88rem;color:var(--muted)">
      This will fetch the latest BTC price data from <strong>Yahoo Finance</strong>,
      compute Logarithmic Regression, then run
      <strong>{n_combos:,} parallel backtests</strong> using an
      <strong>O(1)-RAM streaming Numba JIT kernel</strong> (~8.6&nbsp;KB buffer).
      Typical runtime: <strong>5&ndash;20 seconds</strong> depending on your CPU.
      For offline/CI regeneration of all research artifacts, run
      <code>python scripts/regenerate_artifacts.py</code>.
    </div>""",
    unsafe_allow_html=True,
)

expected_passcode = _get_admin_passcode()
is_unlocked = False
if expected_passcode:
    entered_passcode = st.text_input(
        "Admin Passcode",
        type="password",
        key="opt_admin_passcode",
        help="Required to unlock live grid-search optimization.",
    )
    if entered_passcode:
        if hmac.compare_digest(
            entered_passcode.encode("utf-8"),
            expected_passcode.encode("utf-8"),
        ):
            is_unlocked = True
        else:
            st.warning("⚠️ Incorrect admin passcode.")
else:
    st.info(
        "🔒 Live re-optimization is locked in public read-only mode. "
        "Set `ADMIN_PASSCODE` in Streamlit Secrets or `BTC_LAB_ADMIN_PASSCODE` "
        "environment variable to unlock."
    )

run_btn = st.button(
    "⚙️ Run Optimization",
    type="primary",
    width="stretch",
    disabled=not is_unlocked,
)

if run_btn and is_unlocked:
    progress_bar = st.progress(0.0)
    status_text = st.empty()

    def _progress(pct: float, msg: str) -> None:
        progress_bar.progress(min(pct, 1.0))
        status_text.markdown(f"*{msg}*")

    try:
        split_date_str = split_date.strftime("%Y-%m-%d")
        is_default_cfg = (
            split_date_str == "2021-01-01"
            and initial_cash == 100_000
            and abs(fee_rate - 0.001) < 1e-9
        )

        # Step 1: Fetch live data
        _progress(0.01, "Fetching live BTC price data from Yahoo Finance...")
        df_live = load_smart_dataset()

        # Step 2: Warm up Numba (first run only — compiles JIT kernels)
        _progress(0.04, "Warming up Numba JIT compiler (first run only)…")
        warmup_optimizer()

        # Step 3: Run grid search
        result = run_live_optimization(
            df_live,
            initial_cash=float(initial_cash),
            fee_rate=float(fee_rate),
            progress_cb=_progress,
            split_date=split_date_str,
            persist=is_default_cfg,
        )

        progress_bar.progress(1.0)

        if result.status == "success":
            status_text.empty()
            if is_default_cfg:
                st.session_state.pop("custom_opt_result", None)
                st.success(
                    f"✅ Optimization complete: {result.total_combinations:,} combinations "
                    f"in **{result.elapsed_seconds}s**. Results were saved to `data/live_optimal_params.json`"
                )
            else:
                st.session_state["custom_opt_result"] = _result_to_display_dict(result)
                st.success(
                    f"✅ Custom optimization complete: {result.total_combinations:,} combinations "
                    f"in **{result.elapsed_seconds}s** (saved for this session only)."
                )
            st.rerun()

        else:
            status_text.error(f"❌ Optimization error: {result.error_message}")

    except (OSError, ValueError, KeyError, TypeError, RuntimeError):
        logger.exception("Unexpected error during live optimization")
        status_text.empty()
        st.error("❌ Unexpected error while running optimization. Please try again later.")


# ── How to use results in Simulator ──────────────────────────────────────────

st.markdown("---")
st.markdown("### 🔗 Using These Results in the Simulator")
st.markdown("""
After running the optimizer:

1. **Go to the Simulator page** (`← Simulator` in the sidebar)
2. **Select a `🌐 Live Optimized (...)` preset** (for default settings) or **`🔧 Custom`** and enter the parameters shown above
3. Run the simulation — the Simulator automatically uses the latest hybrid live BTC dataset

> 💡 The optimizer targets the **in-sample period** (before your split date) to prevent overfitting.
> You can then validate OOS performance directly in the Simulator against recent BTC prices.
""")

# ── Index revision bias explainer ─────────────────────────────────────────────

with st.expander("📚 Why independent calculation was chosen"):
    st.markdown("""
    **Colin's CBBI is not static.** When he adds, removes, or modifies an indicator
    (e.g., removing Stock-to-Flow, reweighting Pi Cycle), his algorithm retroactively
    recalculates the entire CBBI history back to 2011.

    This means:
    - The score for `2021-01-01` in our frozen `master_dataset.parquet` is **63.65**
    - The same date via the live CBBI API (2026-04-17) was **78.13**

    **A 14.5-point drift on one day.** Across thousands of days, this shifts when
    every single buy/sell signal fires.

    **The solution:** Instead of fetching from the CBBI API, the Logarithmic Regression indicator
    is computed **independently** from BTC price data using a power-law logarithmic
    regression model (`core/trolololo.py`). This formula is deterministic — it
    produces the same value for any given BTC price history, regardless of what
    Colin changes in his index.

    The research snapshot (frozen) used this same formula. So the live optimizer
    is now consistent with the academic research by design.

    ---
    *For the academic research paper*, this phenomenon is documented as a limitation
    under "Index Revision Risk." The frozen dataset remains the canonical research
    artifact — it is reproducible. This optimizer is the practical deployment solution.
    """)
