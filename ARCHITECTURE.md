# System Architecture & Technical Specification
## BTC Strategy Lab — Interactive Backtesting Web Application

**Version:** 2.2  
**Date:** November 2026  
**Author:** Solo Developer  
**Status:** Production (Deployed)  
**Repo:** `btc-strategy-lab`  
**Last Updated:** 2026-11-26 — Documented immutable pre-2026 cycle-mark Trolololo calibration, O(1)-RAM streaming optimizer kernel, `data/research/` pre-aggregated artifacts, `ADMIN_PASSCODE` gate, and `.github/workflows/ci.yml`

---

## 1. Project Overview

### 1.1 Background

This web application is the public-facing deliverable of Phase 4 of the academic research project:
**"Optimalisasi Parameter Trading Bitcoin Menggunakan Grid Search pada Tiga Metrik Evaluasi Berbasis Indikator Logarithmic Regression"** (PKL Research, 2026).

Phases 1–3 of the research were completed in the research repository (`btc-trading-optimization`):
- **Phase 1:** Data pipeline — master dataset built from 10 indicators (8 CBBI sub-indicators + composite Confidence Score from CBBI XLSX, plus independently computed Logarithmic Regression) and yfinance BTC prices. **Logarithmic Regression (Trolololo) is computed independently** via Dynamic Channel Normalization on BTC-USD close prices using immutable `2012–2022` confirmed cycle marks, eliminating *Index Revision Bias* and post-2026 lookahead.
- **Phase 2:** Indicator selection — Logarithmic Regression (Trolololo) identified as the most statistically significant signal indicator (composite score 0.6557, Spearman ρ = −0.4261 at 90-day lag) among the 10 indicators analyzed.
- **Phase 3:** Optimization engine — Grid Search across 1,293,750 parameter combinations, two scenarios, regenerated deterministically via `scripts/regenerate_artifacts.py`.
- **Phase 4 Extension:** Hybrid live data pipeline — `load_smart_dataset()` fetches recent BTC prices from Yahoo Finance and computes Trolololo independently in real time with no CBBI API dependency.

This repository (`btc-strategy-lab`) contains **only the web application**. Only the processed research outputs (master dataset, optimal summary JSON, live params JSON, and lightweight pre-aggregated `data/research/` artifacts) are stored under `data/`.

### 1.2 Application Purpose

| Purpose | Audience | Description |
|---|---|---|
| **Interactive Simulator** | Public / Investors | Run live backtests with custom or optimal parameters on 2012–present BTC data |
| **Research Results Viewer** | Academics / Lecturer | Read-only display of Phase 3 optimization outcomes on the frozen 2012–2026-03-15 snapshot |
| **Dynamic Optimizer** | Deployment / Power Users | Re-run the 1.29M-combination grid search on live BTC data |

### 1.3 Signal Indicator

The application uses **Trolololo (Logarithmic Regression / Rainbow Chart)** as the trading signal column throughout — for the simulator, the research results display, and the live optimizer. Signal rules are inclusive:
- **BUY** when `signal <= threshold_buy`
- **SELL** when `signal >= threshold_sell`
- **HOLD** when `threshold_buy < signal < threshold_sell`

---

## 2. Technical Architecture

### 2.1 Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Streamlit 1.35+ | Native Python, zero frontend build step, Community Cloud deploy |
| **Backtest Engine** | Numba (`@njit`, `prange`) + Python trace | C-level JIT performance for 1.29M-combo grid search; full daily trace for Simulator |
| **Charts** | Plotly (via `st.plotly_chart`) | Full interactivity: zoom, pan, hover, click-to-inspect |
| **Data** | Parquet via PyArrow + CSV | ~372 KB master dataset; pre-aggregated `data/research/` artifacts (~43 KB heatmaps, ~8 KB Top-100 CSVs) |
| **Caching** | `@st.cache_data` / `@st.cache_resource` | Bounded TTL (`300s` live data, `1800s` / `max_entries=1` research artifacts) |
| **Security Gate** | Env / `st.secrets` + `hmac.compare_digest` | Page 4 Optimizer locked read-only by default unless `BTC_LAB_ADMIN_PASSCODE` or `ADMIN_PASSCODE` is configured |
| **CI & Deployment** | GitHub Actions + Streamlit Cloud | `.github/workflows/ci.yml` (`pip check`, `ruff check .`, `pytest -v`); auto-deploy from `main` |

### 2.2 Repository Structure

```text
btc-strategy-lab/
├── .github/workflows/ci.yml            # CI: pip check, ruff check ., pytest -v (Python 3.11)
├── app.py                              # Streamlit entry point (Home / nav hub)
├── ARCHITECTURE.md                     # This document
├── README.md                           # Public-facing repo description
├── pyproject.toml                      # Pytest & Ruff configuration
├── requirements.txt                    # Python dependencies (bounded major versions)
├── .gitignore
│
├── core/
│   ├── __init__.py
│   ├── charts.py                       # All Plotly chart builder functions
│   ├── data_loader.py                  # Static snapshot, hybrid live pipeline, pre-aggregated loaders
│   ├── engine.py                       # Numba JIT (run_backtest_numba) & full trace (run_backtest_full)
│   ├── keepalive.py                    # Client-side heartbeat component (min 30s, same-origin postMessage)
│   ├── models.py                       # Dataclasses: BacktestParameters, StrategyMetrics, BenchmarkMetrics, SimulationResult
│   ├── optimizer.py                    # O(1)-RAM streaming Numba grid search with lock, cooldown, atomic write
│   ├── styles.py                       # Global CSS tokens & sidebar footer
│   ├── trolololo.py                    # Independent Trolololo index & price-band computation (immutable pre-2026 marks)
│   └── utils.py                        # Percentage, currency, and number formatters
│
├── pages/
│   ├── 1_Simulator.py                  # Page 1: Interactive backtesting simulator
│   ├── 2_Research_Results.py           # Page 2: Phase 3 optimization results (read-only)
│   ├── 3_Documentation.py              # Page 3: Methodology, glossary, disclaimer
│   └── 4_Optimizer.py                  # Page 4: Passcode-gated live grid search optimizer
│
├── scripts/
│   └── regenerate_artifacts.py         # Deterministic CLI regenerator for data/ & data/research/
│
├── tests/                              # Unit and Streamlit AppTest smoke tests
│
└── data/
    ├── master_dataset.parquet          # Static snapshot: BTC + CBBI data (2012-01-01 to 2026-03-15, 5,188 rows; 5,187 valid)
    ├── optimal_params_summary.json     # Phase 3 best params for both scenarios
    ├── live_optimal_params.json        # Live optimizer output (written atomically for default config)
    └── research/                       # Pre-aggregated lightweight artifacts (<10ms load, <50 KB RAM)
        ├── s1_heatmap_total_return.parquet   # 46x45 pivot (~43 KB)
        ├── s2_heatmap_total_return.parquet   # 46x45 pivot (~43 KB)
        ├── s1_top100_max_return.csv          # Top 100 S1 trials (~8 KB)
        └── s2_top100_max_return.csv          # Top 100 S2 trials (~8 KB)
```

### 2.3 Trolololo Independent Computation (`core/trolololo.py`)

`trolololo` is **not read from the CBBI XLSX** during live updates. It is computed directly from BTC-USD closing prices using **Dynamic Channel Normalization**:

- Uses two power-law base channels (`top_base = ln(10)*(2.900*ln(d+1400)-19.463)`, `bottom_base = ln(10)*(2.788*ln(d+1200)-19.463)`) where `d` = calendar days since `2012-01-01` (`d_raw = 0` at `2012-01-01` produces `NaN`, yielding `5,187` valid backtestable rows from `2012-01-02` to `2026-03-15`).
- Fits linear OLS regressions on residuals using **only immutable pre-2026 confirmed historical cycle marks** (`CONFIRMED_HIGHS` 2013–2021 and `CONFIRMED_LOWS` 2012–2022) with `include_algo_marks=False` by default. Post-2026 `argrelextrema` detection is strictly opt-in diagnostic only (`include_algo_marks=True`), eliminating post-cutoff lookahead and *Index Revision Bias* when new live BTC prices are appended.
- Exposes both `compute_trolololo()` (normalized `[0, 100]` signal) and `compute_trolololo_bands()` (USD-space `(top_band, bottom_band)`), sharing one internal channel helper.

### 2.4 Backtest Engine & Data Flow

**Engine (`core/engine.py`):**
1. `run_backtest_numba()` — `@njit` scalar metrics kernel `(total_return, max_drawdown, sharpe_ratio, wins, sell_count, trade_count)` with input validation.
2. `run_backtest_full()` — Full daily trace returning `SimulationResult` (`portfolio_history`, `trade_log`, `metrics`, `benchmark_metrics`, `low_sample_warning`).
3. `warmup_numba()` — Available for explicit JIT pre-compilation (invoked by `warmup_optimizer()` when running optimization on Page 4, rather than on homepage startup).

**Simulator Data Flow:**
```text
User clicks "Run Simulation"
    │
    ▼
pages/1_Simulator.py              reads slider/input values
    │
    ├─► core/data_loader.py       load_smart_dataset() (@st.cache_data(ttl=300))
    │                             merges static snapshot + yfinance delta (deduped, no price ffill)
    │                             recomputes compute_trolololo(df_combined["btc_close"].dropna())
    ├─► core/engine.py            run_backtest_full() → SimulationResult
    │
    ▼
pages/1_Simulator.py              render metric cards + Plotly charts + trade log table
    │
    └─► core/charts.py            build_equity_chart(), build_signal_chart()
```

**Research Results Data Flow (`pages/2_Research_Results.py`):**
- Uses `load_static_dataset()` (frozen `2012-01-01` to `2026-03-15` snapshot; `5,187` clean rows `2012-01-02..2026-03-15` inside `run_backtest_full`) via `@st.cache_data` helper `_cached_research_simulation(params_tuple)` for deterministic IS/OOS equity curves.
- Uses `load_heatmap_pivot(scenario, metric)` and `load_top100_trials(scenario, metric)` (`ttl=1800, max_entries=1`), reading pre-aggregated `data/research/` artifacts directly (<10ms, <50 KB RAM) with fallback to `SCENARIO_1_LOG` / `SCENARIO_2_LOG` if raw logs exist on disk.

**Optimizer Data Flow (`pages/4_Optimizer.py` & `core/optimizer.py`):**
- Page 4 enforces an admin passcode gate via `_get_admin_passcode()` (`BTC_LAB_ADMIN_PASSCODE` env var first, then `st.secrets.get("ADMIN_PASSCODE")` guarded against missing `secrets.toml`), verified with constant-time `hmac.compare_digest`. When unconfigured, `"Run Optimization"` is disabled in public read-only mode.
- `run_live_optimization(..., persist=is_default_cfg)` runs the O(1)-RAM streaming `numba.prange` parallel grid search (`_grid_search_best_kernel`, allocating an ~8.6 KB `(45, 3, 8)` reduction buffer instead of an 82.8 MB flat array) guarded by a non-blocking `threading.Lock` and per-process cooldown.
- Default configuration (`split_date="2021-01-01"`, `initial_cash=100_000`, `fee_rate=0.001`) atomically updates `data/live_optimal_params.json`; custom settings run with `persist=False` and remain scoped to `st.session_state["custom_opt_result"]`.

---

## 3. Data Specification

### 3.1 Master Dataset (`data/master_dataset.parquet`)

| Column | Type | Description |
|---|---|---|
| `date` | DatetimeIndex | Daily, `2012-01-01` to `2026-03-15` (`5,188` total rows; `5,187` clean backtestable rows `2012-01-02..2026-03-15` since `d_raw = 0` on `2012-01-01` yields `trolololo = NaN`) |
| `btc_close` | float64 | BTC closing price (signal day T) |
| `btc_open` | float64 | BTC opening price (execution day T+1) |
| `cbbi_confidence` | float64 | Composite CBBI score [0–100] |
| `trolololo` | float64 | **Primary signal column** — Log Regression [0–100] |
| `pi_cycle` | float64 | Pi Cycle Top [0–100] |
| `rupl` | float64 | Relative Unrealized P&L [0–100] |
| `rhodl_ratio` | float64 | RHODL Ratio [0–100] |
| `puell_multiple` | float64 | Puell Multiple [0–100] |
| `two_year_ma_mult` | float64 | 2Y MA Multiplier [0–100] |
| `mvrv_zscore` | float64 | MVRV Z-Score [0–100] |
| `reserve_risk` | float64 | Reserve Risk [0–100] |
| `woobull` | float64 | Woobull NVT [0–100] |
| `fill_flag` | bool | True if forward-filled |
| `phase` | str | `"in_sample"` or `"out_of_sample"` |

### 3.2 Results JSON (`data/optimal_params_summary.json`) & Pre-Aggregated Research Artifacts (`data/research/`)

- `optimal_params_summary.json`: Phase 3 output (`metadata`, `scenario_1`, `scenario_2`, `buy_and_hold_benchmark`) generated deterministically by `scripts/regenerate_artifacts.py`.
  - Scenario 1 OOS validated trade counts: `36` (`max_return`: `9/99/25%/17%`), `63` (`min_drawdown`: `1/70/1%/25%`), `36` (`max_sharpe`: `4/75/25%/12%`).
  - Scenario 2 full-dataset exploration: `max_return` (`7/96/25%/14%`), `min_drawdown` (`1/64/1%/23%`), `max_sharpe` (`4/59/25%/3%`).
- `data/research/s1_heatmap_total_return.parquet` and `s2_heatmap_total_return.parquet` (~43 KB each): 46×45 sensitivity pivot matrices (`threshold_sell` 100..55 × `threshold_buy` 1..45) pre-aggregated from 1,293,750 trials per scenario.
- `data/research/s1_top100_max_return.csv` and `s2_top100_max_return.csv` (~8 KB each): Top 100 trials sorted descending by `total_return` with columns `threshold_buy, threshold_sell, allocation_buy_pct, allocation_sell_pct, total_return, max_drawdown, sharpe_ratio, win_rate, trade_count`.

---

## 4. Caching & Performance Budgets

| Loader / Action | Cache Decorator | Notes |
|---|---|---|
| `load_static_dataset()` | `@st.cache_data(show_spinner=False)` | Frozen snapshot, `attrs["is_live"] = False` |
| `load_smart_dataset()` | `@st.cache_data(ttl=300, show_spinner=False)` | Hybrid snapshot + yfinance delta, `attrs["is_live"] = True/False` |
| `load_research_results()` | `@st.cache_data(show_spinner=False)` | Phase 3 JSON summary |
| `load_scenario1_log()` / `load_scenario2_log()` | `@st.cache_data(ttl=1800, max_entries=1)` | Legacy raw-log loader with `FileNotFoundError` check when absent |
| `load_heatmap_pivot()` / `load_top100_trials()` | `@st.cache_data(ttl=1800, max_entries=1)` | Reads `data/research/` directly (<10ms, <50 KB RAM) with raw-log fallback |
| `_cached_research_simulation()` | `@st.cache_data(show_spinner=False)` | Caches `SimulationResult` per parameter tuple on Page 2 |
