# BTC Strategy Lab — Next.js & Vercel Port Implementation Plan

> **For agentic workers:** Follow strict TDD (Red -> Green -> Verify), `agent-engineering-handbook.md`, `karpathy-guidelines`, `nextjs-app-router-expert`, and `VibeSec-Skill-main`. Work strictly within your assigned disjoint file ownership.

**Goal:** Build a production-grade, standalone Next.js App Router + Vercel port of `btc-strategy-lab` under `web/` with 100% mathematical parity to the canonical Python engine (`atol <= 1e-10`), exact Neo-Brutalist cream/teal visual theme fidelity, Apache ECharts interactive visualizations, live Yahoo Finance delta merging, and zero backend infrastructure dependencies.

**Architecture:** Python (`core/`, `scripts/regenerate_artifacts.py`, `scripts/export_web_data.py`) remains the single offline mathematical source of truth and artifact generator. The Next.js App Router app under `web/` (deployable to `btc-strategy-lab.vercel.app` with Vercel Root Directory = `web`) renders Server Component shells backed by static JSON artifacts, computes client-side backtests in TypeScript (`~1–2 ms` per 5,187-day run for live slider interactivity), merges live BTC-USD daily bars via a cached `/api/btc-data` Route Handler (`revalidate = 300`, Zod-validated, graceful static fallback), and preserves the root Streamlit app (`app.py`) untouched for backwards compatibility.

**Tech Stack:** Next.js 16 (App Router, React 19, TypeScript strict), Tailwind CSS v4, `next/font/google` (`Space Grotesk`, `Work Sans`, `Inter`), Apache ECharts 6 (tree-shaken Canvas renderer), `lucide-react`, `zod`, `vitest`.

---

## Global Constraints

1. **Zero Mathematical Drift:** TypeScript `computeTrolololo`, `computeTrolololoBands`, and `runBacktestFull` MUST match Python `core/trolololo.py` and `core/engine.py` within `1e-10` on all golden fixtures generated directly by Python (verified automatically in Vitest).
2. **Exact Visual Theme Preservation:**
   - Canvas `#fff8f1`, Sidebar `#ede8e0`, Card `#ffffff`, Ink `#213448`, Primary Teal `#0a7c6e` (hover `#085f54`), Muted Slate `#547792`, Borders `#c9c2b8` / `#d4cdc4`, Benchmark Amber `#d97706`, Buy Green `#16a34a`, Sell Red `#dc2626`, Signal Blue `#0369a1`.
   - Fonts via `next/font/google`: `Space Grotesk` (headings, metrics, nav, buttons), `Work Sans` (body prose), `Inter` (labels, metadata, uppercase micro-headings).
   - Neo-Brutalist geometry: `0px` border-radius on cards/buttons/tables/inputs, `2px` solid borders, hard offset shadows (`4px 4px 0px 0px rgba(33,52,72,0.18)` / `5px 5px 0px 0px rgba(33,52,72,0.15)`), tactile press/hover transforms.
3. **App Router Discipline (`nextjs-app-router-expert`):** Server Components by default; push `'use client'` strictly to interactive leaf components (charts, simulator controls, tabs, download buttons). Never mark top-level `page.tsx` files `'use client'`.
4. **Security & Resilience (`VibeSec` + `agent-engineering-handbook.md`):**
   - Zero `dangerouslySetInnerHTML` anywhere in `web/`.
   - Strict Zod validation at `/api/btc-data` and URL search parameter boundaries.
   - Explicit `AbortSignal.timeout(8000)` on external Yahoo Finance HTTP fetches; structured server-side logging + graceful fallback to frozen static snapshot (never leak stack traces or raw upstream errors to clients).
   - Security headers configured in `web/next.config.ts` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`).
   - All external `target="_blank"` links include `rel="noopener noreferrer"`.
   - Zero secrets committed; `.gitignore` ignores `web/node_modules/`, `web/.next/`, `web/.vercel/`, `web/coverage/`.
5. **Streamlit Coexistence:** Do NOT break root `app.py`, `core/`, `pages/`, or existing 82 Python tests.
6. **Git Discipline:** Work on branch `feat/nextjs-vercel-port`. Local atomic Conventional Commits only; NO `git push` or `vercel deploy` without explicit user approval.

---

## Target File Structure

```text
btc-strategy-lab/
├── docs/plans/2026-11-26-nextjs-port-plan.md   # This plan
├── scripts/
│   ├── regenerate_artifacts.py                 # Existing canonical Python regenerator
│   └── export_web_data.py                      # NEW: exports compact JSON + golden parity fixtures to web/
├── tests/
│   └── test_export_web_data.py                 # NEW: pytest verifying web JSON & golden fixtures
├── .github/workflows/ci.yml                    # UPDATED: adds web-ci job (lint, tsc, vitest, build)
├── .gitignore                                  # UPDATED: ignores web/node_modules, web/.next, web/.vercel
└── web/                                        # NEW: Standalone Next.js App Router app (Vercel Root = web)
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts                          # Security headers, strict React mode
    ├── postcss.config.mjs
    ├── eslint.config.mjs
    ├── vitest.config.ts
    ├── public/data/                            # Generated by scripts/export_web_data.py
    │   ├── master_dataset.json                 # Columnar { dates, btc_open, btc_close, trolololo }
    │   ├── optimal_params_summary.json
    │   ├── live_optimal_params.json
    │   ├── s1_heatmap_total_return.json
    │   ├── s2_heatmap_total_return.json
    │   ├── s1_top100_max_return.json
    │   └── s2_top100_max_return.json
    └── src/
        ├── app/
        │   ├── globals.css                     # Tailwind v4 + exact brutalist design tokens & utility classes
        │   ├── layout.tsx                      # Root RSC layout (next/font, Sidebar shell, metadata, SVG favicon)
        │   ├── page.tsx                        # Home RSC (loads static data -> HomeClient + RegressionBandsChart)
        │   ├── simulator/page.tsx              # Simulator RSC (loads static + summary + live -> SimulatorClient)
        │   ├── research/page.tsx               # Research Results RSC (loads summary + heatmaps + top100 -> ResearchClient)
        │   ├── optimizer/page.tsx              # Live Parameters & Optimizer Info RSC
        │   ├── docs/page.tsx                   # 6-tab Documentation RSC + DocsTabs leaf
        │   └── api/btc-data/route.ts           # Cached (revalidate=300) Yahoo Finance delta route + Zod + fallback
        ├── lib/
        │   ├── types.ts                        # Strict domain contracts & Zod schemas
        │   ├── format.ts                       # formatPercentage, formatCurrency, formatNumber, compactDollarTick
        │   ├── trolololo.ts                    # Pure TS Dynamic Channel Normalization (d_raw, immutable 2012-2022 marks)
        │   ├── engine.ts                       # Pure TS runBacktestFull + weekly resample helper (exact Python parity)
        │   ├── market-data.ts                  # Pure merge/dedup/validate helper for Yahoo Finance delta bars
        │   ├── server-data.ts                  # Server-only fs/promises readers for public/data/*.json
        │   ├── csv.ts                          # Safe CSV serializer + client download helper
        │   ├── echarts-setup.ts                # Tree-shaken ECharts registration (CanvasRenderer + needed charts/components)
        │   ├── __fixtures__/golden_parity.json # Generated by Python for automated parity tests
        │   └── __tests__/
        │       ├── format.test.ts
        │       ├── trolololo.test.ts           # Golden parity vs Python + post-2026 immutability
        │       ├── engine.test.ts              # Golden parity vs Python (IS, OOS, Full, crash, bull, dust, invalid)
        │       └── market-data.test.ts         # Yahoo delta merge, dedup, invalid price filtering, fallback
        ├── hooks/
        │   └── useMarketData.ts                # Hydrates from SSR static snapshot, upgrades smoothly via /api/btc-data
        └── components/
            ├── AppShell.tsx                    # Responsive Sidebar (desktop sticky + mobile drawer) + footer + V2 link
            ├── EChartCanvas.tsx                # Generic responsive ECharts Canvas wrapper (ResizeObserver + cleanup)
            ├── Tooltip.tsx                     # Accessible brutalist tooltip matching .custom-tooltip
            ├── charts/
            │   ├── RegressionBandsChart.tsx    # Homepage log-scale BTC price + Top/Bottom adaptive bands
            │   ├── EquityCurveChart.tsx        # Simulator Strategy vs B&H (weekly visual, log Y, trade markers, dataZoom)
            │   ├── SignalIndexChart.tsx        # Simulator daily Trolololo + Buy/Sell shaded zones + threshold lines + markers
            │   ├── IsOosEquityChart.tsx        # Research IS vs OOS equity + vertical split line
            │   ├── DegradationBarChart.tsx     # Research IS -> OOS grouped bar chart
            │   ├── ComparisonBarChart.tsx      # Research 3-panel (Return log, MDD, Sharpe) comparison chart
            │   └── SensitivityHeatmapChart.tsx # 46x45 RdYlGn heatmap clipped at P99
            ├── home/HomeClient.tsx             # Dynamic 3 KPI cards, 4 nav cards, RegressionBandsChart, live/offline strip
            ├── simulator/SimulatorClient.tsx   # Full interactive simulator, presets, URL sync, live metrics, charts, trade log
            ├── research/ResearchClient.tsx     # S1/S2 tabs, mandatory disclosure box, comparison, heatmaps, CSV/JSON export
            ├── optimizer/OptimizerClient.tsx   # Search space summary, live param cards w/ Simulator deep-links, explainer
            └── docs/DocsClient.tsx             # 6 interactive documentation tabs
```

---

## Exact Cross-Module Interfaces & Data Contracts

### `web/src/lib/types.ts`
```ts
export interface ColumnarDataset {
  dates: string[];                 // "YYYY-MM-DD" ascending, deduplicated
  btc_open: number[];
  btc_close: number[];
  trolololo: (number | null)[];    // null only for d_raw <= 0 (e.g. 2012-01-01)
}

export interface BacktestParameters {
  thresholdBuy: number;            // int, 1..99, strictly < thresholdSell
  thresholdSell: number;           // int, 2..100
  allocBuyPct: number;             // float in (0, 1]
  allocSellPct: number;            // float in (0, 1]
  initialCash: number;             // float > 0, default 100_000
  feeRate: number;                 // float in [0, 0.10], default 0.001
}

export interface StrategyMetrics {
  totalReturn: number;
  maxDrawdown: number;
  maxDrawdownDate: string;
  sharpeRatio: number;
  winRate: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  finalCash: number;
  finalBtc: number;
  finalPortfolioValue: number;
}

export interface BenchmarkMetrics {
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  finalValue: number;
}

export interface TradeRow {
  date: string;                    // "YYYY-MM-DD" (T+1 execution date)
  action: "BUY" | "SELL";
  btcPrice: number;                // rounded to 2 decimals
  amountUsd: number;               // rounded to 2 decimals
  btcAmount: number;               // rounded to 6 decimals
  signalIndex: number;             // rounded to 1 decimal
  cashAfter: number;               // rounded to 2 decimals
  btcHeldAfter: number;            // rounded to 6 decimals
  equityAfter: number;             // rounded to 2 decimals
}

export interface PortfolioPoint {
  date: string;
  portfolioValue: number;
  cash: number;
  btcHeld: number;
  btcClose: number;
  buyAndHoldValue: number;
}

export interface SimulationResult {
  portfolioHistory: PortfolioPoint[];
  tradeLog: TradeRow[];
  metrics: StrategyMetrics;
  benchmarkMetrics: BenchmarkMetrics;
  lowSampleWarning: boolean;
  params: BacktestParameters;
}

export interface HeatmapMatrix {
  xLabels: number[];               // Buy thresholds 1..45
  yLabels: number[];               // Sell thresholds 100..55 (descending)
  values: (number | null)[][];     // [row][col]
}

export interface MarketDataResponse {
  isLive: boolean;
  lastDate: string;
  data: ColumnarDataset;
}
```

### Exact Mathematical Rules (Parity Spec)
1. **Days since `2012-01-01`:** Use UTC millisecond difference `(Date.UTC(y, m - 1, d) - Date.UTC(2012, 0, 1)) / 86_400_000` (avoids local DST off-by-one bugs!).
2. **Trolololo (`trolololo.ts`):**
   - `TOP_SLOPE = 2.900`, `TOP_OFFSET = 1400`, `BOTTOM_SLOPE = 2.788`, `BOTTOM_OFFSET = 1200`, `INTERCEPT = 19.463`, `FIRST_HIGH_CORRECTION = 0.6`.
   - `CONFIRMED_HIGHS = ["2013-04-09", "2013-11-30", "2017-12-17", "2021-11-10"]`.
   - `CONFIRMED_LOWS = ["2012-11-18", "2015-01-14", "2018-12-15", "2022-11-21"]`.
   - Nearest-date index lookup for each mark within `[dates[0], dates[n-1]]`; regress residuals against `d_raw[idx]` via closed-form OLS (`slope = sum((x - mx)*(y - my)) / sum((x - mx)^2)`, `intercept = my - slope * mx`); apply `FIRST_HIGH_CORRECTION` to `hiY[0]`.
   - `computeTrolololo(dates, btcClose)` returns `(number | null)[]` clipped to `[0, 100]`.
   - `computeTrolololoBands(dates, btcClose)` returns `{ topBand: (number | null)[], bottomBand: (number | null)[] }` in USD (`Math.exp(channelTop)`, `Math.exp(channelBottom)`).
3. **Engine (`engine.ts`):**
   - Filters rows with `trolololo !== null && Number.isFinite(trolololo)` and finite positive `btc_open`/`btc_close` (throws `Error` if `< 2` rows or invalid non-null prices / invalid params).
   - Loop `i = 0 .. n - 2`: `pExec = open[i + 1]`, `pVal = close[i]`, `currVal = cash + btc * pVal`, `dr[i] = prev > 0 ? (currVal - prev) / prev : 0`.
   - BUY when `sig <= thresholdBuy` and `tradeAmount = cash * allocBuyPct > 1.0`.
   - SELL when `sig >= thresholdSell` and `btcSold = btc * allocSellPct > 0.000001`.
   - Final day `n - 1`: `pv[n - 1] = cash + btc * close[n - 1]`, `dr[n - 1]`.
   - Sharpe over `dr.slice(1)` with **population** standard deviation (`ddof = 0`, matching `np.std`), `rfDaily = 0.04 / 365.0`, annualized by `* Math.sqrt(365.0)`.
   - Benchmark: `bhBtc = (initialCash * (1 - feeRate)) / open[0]`, `bhValues[i] = bhBtc * close[i]`, `bhDailyRet` over `close[i] / close[i-1] - 1` (`ddof = 0`).

---

## Execution Phases & Disjoint Swarm Ownership

### Phase 1 — Python Data Export & Next.js Scaffold (Coordinator + `web-core-engineer`)
- **Task 1 (Coordinator / Python):** Create `scripts/export_web_data.py` + `tests/test_export_web_data.py`, update `.gitignore` (`web/node_modules/`, `web/.next/`, `web/.vercel/`, `web/coverage/`), run `export_web_data.py` to generate all `web/public/data/*.json` and `web/src/lib/__fixtures__/golden_parity.json`, and scaffold `web/` (`package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`) + `npm install`.

### Phase 2 — Parallel Swarm Implementation (Strictly Disjoint Ownership)
1. **`web-core-engineer` (`gemini-4-neon-medium`) — Pure Math Core, API Route, Data Layer & Unit/Parity Tests:**
   - Owned files:
     - `web/src/lib/types.ts`
     - `web/src/lib/format.ts`
     - `web/src/lib/trolololo.ts`
     - `web/src/lib/engine.ts`
     - `web/src/lib/market-data.ts`
     - `web/src/lib/server-data.ts`
     - `web/src/lib/csv.ts`
     - `web/src/hooks/useMarketData.ts`
     - `web/src/app/api/btc-data/route.ts`
     - `web/src/lib/__tests__/*.test.ts`
   - Verification: `npx vitest run` (all golden Python parity + edge-case + API tests pass), `npx tsc --noEmit`.

2. **`web-ui-charts-engineer` (`gemini-4-hydrogen-high`) — Design System, App Shell & All 7 ECharts Components:**
   - Owned files:
     - `web/src/app/globals.css`
     - `web/src/app/layout.tsx`
     - `web/src/lib/echarts-setup.ts`
     - `web/src/components/AppShell.tsx`
     - `web/src/components/EChartCanvas.tsx`
     - `web/src/components/Tooltip.tsx`
     - `web/src/components/charts/*.tsx` (all 7 ECharts charts)

### Phase 3 — Parallel Page Assembly (After Phase 2 contracts & charts exist, Disjoint Page Ownership)
1. **`pages-home-sim-engineer` (`gemini-4-hydrogen-high`) — Home & Simulator Pages:**
   - Owned files:
     - `web/src/app/page.tsx`, `web/src/components/home/HomeClient.tsx`
     - `web/src/app/simulator/page.tsx`, `web/src/components/simulator/SimulatorClient.tsx`
2. **`pages-research-docs-engineer` (`gemini-4-hydrogen-high`) — Research Results, Optimizer Info, Documentation & CI/Docs:**
   - Owned files:
     - `web/src/app/research/page.tsx`, `web/src/components/research/ResearchClient.tsx`
     - `web/src/app/optimizer/page.tsx`, `web/src/components/optimizer/OptimizerClient.tsx`
     - `web/src/app/docs/page.tsx`, `web/src/components/docs/DocsClient.tsx`
     - `.github/workflows/ci.yml` (add `web-ci` job)

### Phase 4 — Independent QA & Live Verification (`web-qa-verifier`, `gemini-4-hydrogen-high`)
- Run fresh:
  1. Python: `.venv\Scripts\ruff.exe check .` and `.venv\Scripts\python.exe -m pytest -v`.
  2. Web: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm audit --omit=dev`.
  3. Live Next.js production server (`npx next start -p 3019`): verify HTTP `200` on `/`, `/simulator`, `/research`, `/optimizer`, `/docs`, `/api/btc-data`, verify security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), verify zero React/hydration/runtime errors.
  4. Secret & git hygiene check.

### Phase 5 — Atomic Local Commits & User Gate
- Commit atomically on `feat/nextjs-vercel-port` (NO `git push` or `vercel deploy` automatically!).
- Present verification evidence and ask user to approve `git push` + PR/merge to `main` + optional Vercel project deployment (`btc-strategy-lab.vercel.app`).

---

## Self-Review Checklist
- [x] Every page from Streamlit (`Home`, `Simulator`, `Research Results`, `Optimizer`, `Documentation`) is mapped to an App Router route with exact visual parity.
- [x] Every chart (`RegressionBands`, `EquityCurve`, `SignalIndex`, `IsOosEquity`, `DegradationBar`, `ComparisonBar`, `SensitivityHeatmap`) is mapped to a dedicated tree-shaken ECharts component.
- [x] Zero placeholders ("TBD", "TODO"); exact interfaces, formulas, constants, and file paths are specified.
- [x] File ownership across parallel workers is strictly disjoint.
- [x] Golden parity fixture guarantees TypeScript calculations match Python within `1e-10`.
