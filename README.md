# BTC Strategy Lab

Interactive Bitcoin backtesting simulator powered by on-chain indicators and Logarithmic Regression signal analysis.

Built as the public deliverable of the research project:
"Optimalisasi Parameter Trading Bitcoin Menggunakan Grid Search pada Tiga Metrik Evaluasi Berbasis Indikator Logarithmic Regression" (PKL Research, 2026).

[![Open in Streamlit](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://btc-strategy-lab.streamlit.app)

---

## Features

- **Strategy Simulator:** Run backtests with custom parameters on 14+ years of Bitcoin data (`5,188` total rows in `master_dataset.parquet`; `5,187` clean backtestable rows `2012-01-02` to `2026-03-15`). Uses a pure-Python daily trace engine (`run_backtest_full`) paired with a Numba JIT-compiled optimization engine.
- **Hybrid Live Data Pipeline:** Automatically appends recent BTC-USD daily prices from Yahoo Finance onto the frozen static snapshot (`2012-01-01` to `2026-03-15`) and recomputes Logarithmic Regression in real time using immutable pre-2026 confirmed cycle marks (zero post-2026 `argrelextrema` lookahead and zero Index Revision Bias), with graceful offline fallback.
- **Dynamic Parameter Optimizer:** Recalculate optimal parameters against live price data using an O(1)-RAM streaming Numba kernel (~8.6 KB buffer), gated behind an admin passcode (`ADMIN_PASSCODE` in Streamlit Secrets or `BTC_LAB_ADMIN_PASSCODE` env var) with session-local isolation for custom configs.
- **Historical Research Results:** View Phase 3 optimization outcomes from 1.29 million parameter combinations across multiple scenarios via pre-aggregated `data/research/` artifacts (46×45 heatmaps and Top-100 CSVs) regenerated deterministically by `scripts/regenerate_artifacts.py`.
- **Interactive Charts & CI:** Plotly integration for equity curves, signal overlays, regression bands, and sensitivity heatmaps, backed by `.github/workflows/ci.yml` (`pip check`, `ruff check .`, `pytest -v`).
- **User Interface:** Responsive interface with consistent styling and interactive tooltips.

## Signal Indicator

This application uses **Logarithmic Regression** (also known as Bitcoin Rainbow Chart) as the primary trading signal. This indicator was identified as the most statistically significant among 10 indicators analyzed (9 CBBI sub-indicators + composite CBBI Confidence Score), based on Spearman correlation analysis (composite score 0.6557, ρ = −0.4261 at 90-day lag). It is computed independently from BTC price data via Dynamic Channel Normalization using immutable `2012–2022` confirmed cycle marks, with no dependency on third-party APIs.

## Running Locally

```bash
git clone https://github.com/bennypepper/btc-strategy-lab.git
cd btc-strategy-lab
pip install -r requirements.txt
streamlit run app.py
```

Requires Python 3.11 or higher.

- **Admin Optimizer Unlock (optional):** Page 4 (`Optimizer`) is locked in public read-only mode by default. Set `BTC_LAB_ADMIN_PASSCODE` in your environment (or `ADMIN_PASSCODE` in `.streamlit/secrets.toml`) to unlock live re-optimization.
- **Artifact Regeneration (CLI):** Run `python scripts/regenerate_artifacts.py` to recompute `trolololo` and regenerate `optimal_params_summary.json`, `live_optimal_params.json`, and `data/research/` artifacts in O(1) RAM.

## Project Structure

```text
btc-strategy-lab/
├── .github/workflows/ci.yml        # CI pipeline (pip check, ruff check ., pytest -v)
├── app.py                          # Home page and sidebar navigation
├── core/                           # Shared logic, engine, and UI helpers
│   ├── charts.py                   # Plotly chart builders
│   ├── data_loader.py              # Static Parquet, hybrid live yfinance & pre-aggregated loaders
│   ├── engine.py                   # Numba JIT & full-trace backtest engines
│   ├── keepalive.py                # Client-side WebSocket keepalive component
│   ├── models.py                   # Typed parameter, metrics, and result dataclasses
│   ├── optimizer.py                # O(1)-RAM streaming Numba grid-search optimizer
│   ├── styles.py                   # Centralized CSS design tokens and theme
│   ├── trolololo.py                # Independent Logarithmic Regression (immutable pre-2026 marks)
│   └── utils.py                    # Currency, percentage, and number formatters
├── pages/                          # Streamlit application pages
│   ├── 1_Simulator.py              # Interactive simulator
│   ├── 2_Research_Results.py       # Static Phase 3 research results
│   ├── 3_Documentation.py          # Architectural and mathematical documentation
│   └── 4_Optimizer.py              # Passcode-gated live parameter optimizer
├── scripts/
│   └── regenerate_artifacts.py     # Deterministic CLI generator for data/ & data/research/
├── tests/                          # Pytest unit and Streamlit AppTest smoke suites
└── data/                           # Datasets and pre-aggregated research artifacts
    ├── master_dataset.parquet      # Frozen snapshot (2012-01-01 to 2026-03-15, 5,188 rows; 5,187 valid)
    ├── optimal_params_summary.json # Phase 3 optimal parameters
    ├── live_optimal_params.json    # Cached results from the Live Optimizer
    └── research/                   # Pre-aggregated 46x45 heatmaps & Top-100 CSVs
        ├── s1_heatmap_total_return.parquet
        ├── s2_heatmap_total_return.parquet
        ├── s1_top100_max_return.csv
        └── s2_top100_max_return.csv
```

## Disclaimer

This application is for educational and academic purposes only. All results are based on historical backtesting. Nothing here constitutes financial advice. Past performance does not guarantee future results.

## Research Context

- **Phase 1-3 repository:** Public research repo (https://github.com/bennypepper/btc-trading-optimization)
- **Research title:** Optimalisasi Parameter Trading Bitcoin Menggunakan Grid Search pada Tiga Metrik Evaluasi Berbasis Indikator Logarithmic Regression
- **Data sources:** CBBI dataset (9 sub-indicators + composite Confidence Score = 10 indicators analyzed) + Yahoo Finance BTC-USD. Logarithmic Regression is computed independently.
- **Optimization:** Grid Search across 1,293,750 parameter combinations × 3 evaluation metrics
- **Framework:** Undergraduate Research (PKL), 2026

## License

This project is licensed under the terms of the [LICENSE](LICENSE) file included in this repository.
