"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, BookOpen } from "lucide-react";

const DOC_TABS = [
  { id: "indicators", label: "On-Chain Indicators" },
  { id: "logic", label: "Strategy Logic" },
  { id: "glossary", label: "Metric Glossary" },
  { id: "methodology", label: "Research Methodology" },
  { id: "disclaimer", label: "Disclaimer & Limitations" },
  { id: "author", label: "About the Author" },
] as const;

type DocTabId = (typeof DOC_TABS)[number]["id"];

const INDICATORS_LIST = [
  {
    name: "Logarithmic Regression",
    featured: true,
    internal: "trolololo",
    description:
      "Dynamic Channel Normalization Band, which is the primary signal used in this app",
  },
  {
    name: "CBBI Confidence Score",
    featured: true,
    internal: "cbbi_confidence",
    description: "Composite CBBI blend across the 9 underlying cycle metrics",
  },
  {
    name: "Pi Cycle Top",
    featured: false,
    internal: "pi_cycle",
    description: "Identifies cycle tops using moving average crossovers",
  },
  {
    name: "RUPL",
    featured: false,
    internal: "rupl",
    description: "Relative Unrealized Profit / Loss across all wallets",
  },
  {
    name: "RHODL Ratio",
    featured: false,
    internal: "rhodl_ratio",
    description: "Compares realized value of coins from different age bands",
  },
  {
    name: "Puell Multiple",
    featured: false,
    internal: "puell_multiple",
    description: "Miner profitability relative to 1-year average",
  },
  {
    name: "2Y MA Multiplier",
    featured: false,
    internal: "two_year_ma_mult",
    description: "BTC price relative to 2-year moving average",
  },
  {
    name: "MVRV Z-Score",
    featured: false,
    internal: "mvrv_zscore",
    description: "Market cap vs realized cap in standard deviations",
  },
  {
    name: "Reserve Risk",
    featured: false,
    internal: "reserve_risk",
    description: "Confidence vs opportunity cost of long-term holders",
  },
  {
    name: "Woobull NVT",
    featured: false,
    internal: "woobull",
    description: "Network Value to Transactions ratio",
  },
] as const;

function IndicatorsTab() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-[#213448]">
          On-Chain Indicators
        </h2>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          The <strong>Crypto Bitcoin Bull/Bear Index (CBBI)</strong> is a
          composite on-chain data indicator that attempts to identify where
          Bitcoin is within its market cycle.
        </p>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          Rather than relying on price alone, CBBI combines 9 sub-indicators
          (including Logarithmic Regression and 8 other cycle metrics) into a
          single <strong>CBBI Confidence Score</strong> (
          <code>cbbi_confidence</code>) — totaling 10 indicators analyzed in the
          underlying research. Each metric is normalized to a scale of{" "}
          <strong>0 to 100</strong>.
        </p>
        <div className="brutal-info-strip space-y-1 font-body text-sm">
          <div>
            <strong>0 = Deep bear market / accumulation zone</strong>
          </div>
          <div>
            <strong>100 = Peak euphoria / distribution zone</strong>
          </div>
        </div>
        <p className="font-label text-xs text-[#547792]">
          Data source:{" "}
          <a
            href="https://cbbi.info"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[#0a7c6e] underline"
          >
            cbbi.info
          </a>{" "}
          · Dataset: 2012-01-01 to 2026-03-15
        </p>
      </section>

      <hr className="brutal-divider my-6" />

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold text-[#213448]">
          The 10 On-Chain Indicators Analyzed (9 CBBI Metrics + Composite Score)
        </h3>
        <div className="brutal-table-wrap">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#c9c2b8] bg-[#ede8e0]">
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Indicator
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Internal Name
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {INDICATORS_LIST.map((item) => (
                <tr
                  key={item.internal}
                  className="border-b border-[#d4cdc4] last:border-b-0"
                >
                  <td className="px-4 py-2.5 font-body text-[#213448]">
                    {item.featured ? (
                      <strong>{item.name}</strong>
                    ) : (
                      item.name
                    )}
                    {item.internal === "trolololo" && (
                      <span className="ml-2 border border-[#0a7c6e] bg-[#0a7c6e]/10 px-1.5 py-0.5 font-label text-[10px] font-bold uppercase text-[#0a7c6e]">
                        Primary
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-[#0369a1]">
                    <code>{item.internal}</code>
                  </td>
                  <td className="px-4 py-2.5 font-body text-[#213448]">
                    {item.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="brutal-divider my-6" />

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold text-[#213448]">
          Why Logarithmic Regression?
        </h3>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          Phase 2 of the underlying research performed{" "}
          <strong>Spearman correlation analysis</strong> across all 10
          indicators against forward Bitcoin returns at 7, 14, 30, 60, and
          90-day lag windows on In-Sample data (2012–2020).
        </p>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          The analysis found that{" "}
          <strong>
            Logarithmic Regression (Dynamic Channel Normalization)
          </strong>{" "}
          consistently showed the highest composite score by combining
          correlation strength and statistical significance (p &lt; 0.05) across
          multiple lag windows. This makes it the most reliable indicator for
          threshold-based signal generation within this research framework.
        </p>
        <p className="font-body text-sm font-medium text-[#0a7c6e]">
          All simulations in this app use Logarithmic Regression as the signal
          column.
        </p>
      </section>
    </div>
  );
}

function StrategyLogicTab() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold text-[#213448]">
          Strategy Trading Logic
        </h2>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          The strategy is a{" "}
          <strong>threshold-based, fractional allocation</strong> system. It
          does not predict price; instead, it reacts to on-chain cycle position.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-bold text-[#213448]">
          Signal Rules
        </h3>
        <div className="brutal-table-wrap">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#c9c2b8] bg-[#ede8e0]">
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Condition
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Action
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2.5 font-body">
                  Index &le; Buy Threshold
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#16a34a]">
                  BUY
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  <code>alloc_buy_pct &times; current_cash</code>
                </td>
              </tr>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2.5 font-body">
                  Index &ge; Sell Threshold
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#dc2626]">
                  SELL
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  <code>alloc_sell_pct &times; current_btc_holdings</code>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-body">
                  Buy Threshold &lt; Index &lt; Sell Threshold
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#547792]">
                  HOLD
                </td>
                <td className="px-4 py-2.5 font-body">No trade</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-bold text-[#213448]">
          Execution (Anti-Lookahead Bias)
        </h3>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          All trades follow the <strong>T+1 execution rule</strong> to prevent
          lookahead bias:
        </p>
        <pre className="overflow-x-auto border-2 border-[#213448] bg-[#213448] p-4 font-mono text-xs leading-relaxed text-[#fff8f1]">
          {`Day T:    Observe Index[T]  →  Decision made (BUY / SELL / HOLD)\nDay T+1:  Execute at BTC Open Price[T+1]`}
        </pre>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          This ensures that no future information is used in trading decisions.
          The strategy only acts on information available at market close on day
          T.
        </p>
      </section>

      <section className="space-y-2.5">
        <h3 className="font-display text-base font-bold text-[#213448]">
          Fee Model
        </h3>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          Each trade incurs a percentage fee applied to the gross transaction
          value:
        </p>
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-[#213448]">
          <li>
            Default: <strong>0.1%</strong> (typical for Binance Spot trading)
          </li>
          <li>Configurable: 0% – 0.5% in Advanced Settings</li>
        </ul>
        <p className="font-body text-sm text-[#213448]">
          Fee is deducted from the transaction amount:
        </p>
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-[#213448]">
          <li>
            BUY: <code>net_amount = trade_amount &times; (1 - fee_rate)</code>
          </li>
          <li>
            SELL:{" "}
            <code>net_proceeds = gross_proceeds &times; (1 - fee_rate)</code>
          </li>
        </ul>
      </section>

      <section className="space-y-2.5">
        <h3 className="font-display text-base font-bold text-[#213448]">
          Portfolio State &amp; Win Rate
        </h3>
        <p className="font-body text-sm text-[#213448]">
          The portfolio tracks three values at all times:
        </p>
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-[#213448]">
          <li>
            <strong>Cash (USD)</strong>: idle capital not yet deployed
          </li>
          <li>
            <strong>BTC Held</strong>: current Bitcoin position
          </li>
          <li>
            <strong>Portfolio Value</strong>:{" "}
            <code>cash + (btc_held &times; btc_close_price)</code>
          </li>
        </ul>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          Win Rate is calculated per SELL trade: a win is a SELL where net
          proceeds exceed the average cost basis of the BTC that was sold.
        </p>
      </section>
    </div>
  );
}

function MetricGlossaryTab() {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold text-[#213448]">
        Metric Definitions
      </h2>

      <section className="space-y-2 border-b-2 border-[#d4cdc4] pb-5">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Total Return
        </h3>
        <p className="font-body text-sm text-[#213448]">
          The percentage gain (or loss) of the strategy portfolio from start to
          end:
        </p>
        <pre className="overflow-x-auto border-2 border-[#c9c2b8] bg-[#fff8f1] p-3 font-mono text-xs text-[#213448]">
          Total Return = (Final Portfolio Value - Initial Capital) / Initial
          Capital
        </pre>
        <p className="font-body text-xs text-[#547792]">
          e.g., +234% means your $100,000 grew to $334,000.
        </p>
      </section>

      <section className="space-y-2 border-b-2 border-[#d4cdc4] pb-5">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Maximum Drawdown (MDD)
        </h3>
        <p className="font-body text-sm text-[#213448]">
          The largest peak-to-trough decline in portfolio value:
        </p>
        <pre className="overflow-x-auto border-2 border-[#c9c2b8] bg-[#fff8f1] p-3 font-mono text-xs text-[#213448]">
          MDD = max over all periods: (Peak Value - Trough Value) / Peak Value
        </pre>
        <p className="font-body text-xs text-[#547792]">
          e.g., -62.8% means at the worst point, the portfolio had lost 62.8% of
          its peak value. Lower is better.
        </p>
      </section>

      <section className="space-y-2 border-b-2 border-[#d4cdc4] pb-5">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Sharpe Ratio
        </h3>
        <p className="font-body text-sm text-[#213448]">
          Risk-adjusted return, measuring return per unit of volatility:
        </p>
        <pre className="overflow-x-auto border-2 border-[#c9c2b8] bg-[#fff8f1] p-3 font-mono text-xs text-[#213448]">
          Sharpe = (Mean Daily Return - Risk-Free Rate) / Std Dev of Daily
          Returns &times; &radic;365
        </pre>
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-[#213448]">
          <li>
            Risk-free rate used: <strong>4.0% per year</strong> (US Treasury
            approximation)
          </li>
          <li>Sharpe &gt; 1.0 is generally considered good for crypto</li>
          <li>Sharpe &gt; 2.0 is excellent</li>
          <li>
            Negative Sharpe means the strategy underperformed the risk-free rate
          </li>
        </ul>
      </section>

      <section className="space-y-2 border-b-2 border-[#d4cdc4] pb-5">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Win Rate
        </h3>
        <p className="font-body text-sm text-[#213448]">
          The percentage of SELL trades that were profitable relative to average
          entry price:
        </p>
        <pre className="overflow-x-auto border-2 border-[#c9c2b8] bg-[#fff8f1] p-3 font-mono text-xs text-[#213448]">
          Win Rate = (Profitable SELL Count) / (Total SELL Count)
        </pre>
        <p className="font-body text-xs text-[#547792]">
          Note: Win Rate only captures directional accuracy of sells, not the
          size of gains/losses. A strategy with 40% win rate can still be
          profitable if wins are much larger than losses.
        </p>
      </section>

      <section className="space-y-2 border-b-2 border-[#d4cdc4] pb-5">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Trade Count
        </h3>
        <p className="font-body text-sm text-[#213448]">
          Total number of BUY + SELL transactions executed. A count below 10
          triggers a warning: statistical metrics like Win Rate and Sharpe are
          not reliable with very few observations.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Buy &amp; Hold Benchmark
        </h3>
        <p className="font-body text-sm text-[#213448]">
          A passive strategy that invests 100% of initial capital at day 1 and
          holds until the end. Used as a performance baseline for the active
          strategy.
        </p>
      </section>
    </div>
  );
}

function ResearchMethodologyTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-[#213448]">
          Research Methodology
        </h2>
        <p className="mt-1 font-body text-sm text-[#547792]">
          This application presents results from a 4-phase academic research
          project.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Phase 1: Data Pipeline
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 font-body text-sm leading-relaxed text-[#213448]">
          <li>
            <strong>Source 1:</strong> CBBI official dataset (XLSX from{" "}
            <code>cbbi.info</code>) containing 8 on-chain sub-indicators and
            composite score (<code>cbbi_confidence</code>)
          </li>
          <li>
            <strong>Source 2:</strong> BTC-USD daily prices from yfinance (
            <code>BTC-USD</code>) used for <code>btc_open</code> (T+1 execution)
            and <code>btc_close</code>
          </li>
          <li>
            <strong>
              Logarithmic Regression (Immutable Confirmed-Cycle Calibration):
            </strong>{" "}
            <code>trolololo</code> is <strong>not</strong> sourced from the CBBI
            XLSX. It is computed independently from <code>btc_close</code> using{" "}
            <strong>Dynamic Channel Normalization</strong> (
            <code>core/trolololo.py</code> / <code>src/lib/trolololo.ts</code>),
            fitting two power-law base channels and linear drift regressions
            over calendar days <code>d_raw</code> using only immutable pre-2026
            confirmed cycle marks (<code>CONFIRMED_HIGHS</code> 2013–2021 and{" "}
            <code>CONFIRMED_LOWS</code> 2012–2022). This eliminates post-2026{" "}
            <code>argrelextrema</code> lookahead and{" "}
            <em>Index Revision Bias</em>, guaranteeing historical signal values
            never shift when new live prices are appended.
          </li>
          <li>
            Preprocessing: string parsing &rarr; float64, forward fill &le; 7
            days, date alignment
          </li>
          <li>
            Static dataset snapshot: 2012-01-01 to 2026-03-15 (
            <strong>5,188</strong> total rows; <strong>5,187</strong> clean
            backtestable rows from 2012-01-02 to 2026-03-15 after dropping the
            2012-01-01 origin row where <code>d_raw = 0</code>)
          </li>
          <li>
            Validation: <code>validate_no_lookahead()</code> confirmed no
            backward fill was applied
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Phase 2: Indicator Selection
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 font-body text-sm text-[#213448]">
          <li>
            Method: Spearman correlation (non-parametric, robust to non-normal
            distributions)
          </li>
          <li>Lag windows tested: 7, 14, 30, 60, 90 days forward</li>
          <li>
            Analysis restricted to <strong>In-Sample data (2012–2020)</strong>{" "}
            to prevent data leakage
          </li>
          <li>
            Composite score:{" "}
            <code>
              0.6 &times; |max_spearman_rho| + 0.4 &times; (1 -
              min_p_value_normalized)
            </code>
          </li>
          <li>
            Result: <strong>Logarithmic Regression</strong> ranked highest and
            was selected as the primary signal
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Phase 3: Optimization Engine &amp; Artifacts
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 font-body text-sm text-[#213448]">
          <li>
            Algorithm: <strong>Grid Search</strong> (exhaustive, deterministic)
          </li>
          <li>
            Parameter space:{" "}
            <code>45 &times; 46 &times; 25 &times; 25 = 1,293,750</code>{" "}
            combinations per run
          </li>
          <li>
            Parallelization &amp; Memory: <code>numba.prange</code> + Numba JIT
            (<code>@njit(parallel=True)</code>) using an{" "}
            <strong>O(1)-RAM streaming reduction kernel</strong> (~8.6 KB
            per-buy buffer instead of materializing multi-MB trial tables in
            memory)
          </li>
          <li>
            Pre-aggregated artifacts:{" "}
            <code>scripts/regenerate_artifacts.py</code> and{" "}
            <code>scripts/export_web_data.py</code> generate compact JSON
            artifacts, 46&times;45 sensitivity heatmaps, and Top-100 exports
          </li>
          <li>
            6 runs total: 2 scenarios &times; 3 objectives (Max Return, Min
            Drawdown, Max Sharpe)
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          Two Scenarios Explained
        </h3>
        <div className="brutal-table-wrap">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#c9c2b8] bg-[#ede8e0]">
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Aspect
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#0a7c6e]">
                  Scenario 1
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#0369a1]">
                  Scenario 2
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2 font-medium">Optimization data</td>
                <td className="px-4 py-2">In-Sample (2012–2020)</td>
                <td className="px-4 py-2">Full dataset (2012–2026)</td>
              </tr>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2 font-medium">Validation</td>
                <td className="px-4 py-2">Forward test on OOS (2021–2026)</td>
                <td className="px-4 py-2">None</td>
              </tr>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2 font-medium">Lookahead bias</td>
                <td className="px-4 py-2 font-semibold text-[#16a34a]">
                  None (strictly isolated)
                </td>
                <td className="px-4 py-2 font-semibold text-[#d97706]">
                  Present by design
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-medium">Research purpose</td>
                <td className="px-4 py-2">Prove robustness</td>
                <td className="px-4 py-2">Map historical ceiling</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-base font-bold text-[#0a7c6e]">
          In-Sample vs Out-of-Sample &amp; Manual Verification
        </h3>
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-[#213448]">
          <li>
            <strong>In-Sample (IS)</strong>: 2012-01-01 – 2020-12-31, data used
            for optimization
          </li>
          <li>
            <strong>Out-of-Sample (OOS)</strong>: 2021-01-01 – 2026-03-15, data
            held back for validation
          </li>
        </ul>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          OOS performance is the honest benchmark of how the optimized strategy
          would have performed on data it never &ldquo;saw&rdquo; during
          training. Significant performance degradation from IS to OOS is a
          warning sign of overfitting.
        </p>
        <p className="font-body text-sm leading-relaxed text-[#213448]">
          <strong>Manual Verification:</strong> 20 representative trade points
          (bull, bear, sideways) were manually verified against the backtest
          engine output; all 20 matched within <code>abs(delta) &lt; 1e-6</code>
          . Additionally, the TypeScript web engine is parity-tested against
          Python golden fixtures within <code>1e-10</code>.
        </p>
      </section>
    </div>
  );
}

function DisclaimerTab() {
  return (
    <div className="space-y-6">
      <div className="brutal-disclaimer space-y-3">
        <div className="flex items-center gap-2 font-display text-base font-bold text-[#7f1d1d]">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Investment Disclaimer</span>
        </div>
        <p>
          <strong>
            BTC Strategy Lab is an academic research tool built for educational
            purposes only.
          </strong>
        </p>
        <p>
          Nothing on this platform constitutes financial advice, investment
          advice, trading advice, or any other type of advice. The content on
          this application should not be used as the basis for any financial
          decision.
        </p>
        <p>
          Historical backtesting results are{" "}
          <strong>not a guarantee of future performance</strong>. Past
          performance in financial markets is not indicative of future results.
          Bitcoin and cryptocurrency markets involve substantial risk of loss.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            All results are based on historical simulations, not live or
            forward-looking signals
          </li>
          <li>
            Scenario 2 results contain intentional lookahead bias and cannot be
            used for trading
          </li>
          <li>
            The research authors are not financial advisors or licensed
            investment professionals
          </li>
          <li>
            This tool was developed as part of undergraduate academic research
            (PKL 2026)
          </li>
        </ol>
      </div>

      <section className="space-y-4">
        <h3 className="font-display text-lg font-bold text-[#213448]">
          Research Limitations
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="brutal-card-static p-4">
            <h4 className="font-display text-sm font-bold text-[#213448]">
              1. Market Cycle Coverage
            </h4>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-[#213448]">
              The Bitcoin dataset (2012–2026) covers approximately 3–4 full
              market cycles — a small sample size for statistical inference.
              Parameters optimal over 3 cycles may not generalize to future
              cycles.
            </p>
          </div>

          <div className="brutal-card-static p-4">
            <h4 className="font-display text-sm font-bold text-[#213448]">
              2. Signal Frequency in OOS Period
            </h4>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-[#213448]">
              The Out-of-Sample period (2021–2026) exhibited different dynamics
              than In-Sample. Logarithmic Regression spent extended periods in
              the hold zone, generating fewer trades. This is a feature of the
              market cycle, not a system failure.
            </p>
          </div>

          <div className="brutal-card-static p-4">
            <h4 className="font-display text-sm font-bold text-[#213448]">
              3. Data Recency
            </h4>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-[#213448]">
              The static historical dataset snapshot is frozen at{" "}
              <strong>2026-03-15</strong>. The hybrid live data pipeline fetches
              recent BTC prices from Yahoo Finance and computes Logarithmic
              Regression independently in real time (falling back gracefully to
              the static snapshot if offline), while the remaining 8 CBBI
              sub-indicators reflect the frozen snapshot only.
            </p>
          </div>

          <div className="brutal-card-static p-4">
            <h4 className="font-display text-sm font-bold text-[#213448]">
              4. Execution Assumptions
            </h4>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 font-body text-sm text-[#213448]">
              <li>Infinite liquidity at the stated open price</li>
              <li>No slippage beyond the configured fee rate</li>
              <li>No partial fills or order failures</li>
              <li>BTC open price as sole execution price</li>
            </ul>
          </div>

          <div className="brutal-card-static p-4">
            <h4 className="font-display text-sm font-bold text-[#213448]">
              5. Parameter Overfitting
            </h4>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-[#213448]">
              Despite the IS/OOS split, Grid Search with 1.29M combinations on a
              finite dataset may still select parameters overfit to historical
              noise patterns. OOS forward testing provides evidence of
              generalizability, not proof of robustness.
            </p>
          </div>

          <div className="brutal-card-static p-4">
            <h4 className="font-display text-sm font-bold text-[#213448]">
              6. Index Revision Bias
            </h4>
            <p className="mt-1.5 font-body text-sm leading-relaxed text-[#213448]">
              CBBI scores are periodically revised retroactively when the
              provider updates its formula (e.g., <code>2021-01-01</code>{" "}
              drifted +14.48 pts between snapshot 63.65 and live API 78.13 on
              2026-04-17). Independent Logarithmic Regression eliminates this
              bias for our primary signal.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-bold text-[#213448]">
          Data Sources
        </h3>
        <div className="brutal-table-wrap">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#c9c2b8] bg-[#ede8e0]">
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Source
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Data
                </th>
                <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Coverage
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2.5 font-body font-medium">
                  <a
                    href="https://cbbi.info"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0a7c6e] underline"
                  >
                    CBBI Official (cbbi.info)
                  </a>
                </td>
                <td className="px-4 py-2.5 font-body">
                  8 on-chain sub-indicators + Confidence Score (from XLSX)
                </td>
                <td className="px-4 py-2.5 font-body">
                  2011-06-27 – 2026-03-15
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-body font-medium">
                  Yahoo Finance (BTC-USD)
                </td>
                <td className="px-4 py-2.5 font-body">
                  BTC-USD daily Close &amp; Open prices + independent
                  Logarithmic Regression computation
                </td>
                <td className="px-4 py-2.5 font-body">
                  2012-01-01 – 2026-03-15 (static snapshot); hybrid live
                  pipeline extends to present
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="font-body text-xs text-[#547792]">
          This application is not affiliated with, endorsed by, or connected to
          CBBI, cbbi.info, Cole Garner, Yahoo Finance, or any cryptocurrency
          exchange.
        </p>
      </section>
    </div>
  );
}

function AuthorTab() {
  const links = [
    {
      label: "GitHub Profile",
      handle: "github.com/bennypepper",
      href: "https://github.com/bennypepper",
    },
    {
      label: "Research Repository",
      handle: "btc-trading-optimization",
      href: "https://github.com/bennypepper/btc-trading-optimization",
    },
    {
      label: "Multi-Asset V2",
      handle: "poly-strategy-lab",
      href: "https://github.com/bennypepper/poly-strategy-lab",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="brutal-card-static border-l-4 border-l-[#0a7c6e] p-6">
        <div className="section-label">About the Author</div>
        <h2 className="mt-1 font-display text-2xl font-bold text-[#213448]">
          Benedict Pepper
        </h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-[#213448]">
          <strong>Benedict Pepper</strong> is an Informatics Engineering student
          at <strong>Ma Chung University</strong>. This web application was
          developed as the public deliverable for his undergraduate research
          (PKL / Internship) in 2026.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {links.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="brutal-btn justify-between px-4 py-3 text-left no-underline"
            >
              <div>
                <div className="font-label text-[10px] font-bold uppercase tracking-wider text-[#547792]">
                  {item.label}
                </div>
                <div className="font-display text-sm font-bold text-[#0a7c6e]">
                  {item.handle}
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </a>
          ))}
        </div>

        <p className="mt-5 border-t border-[#d4cdc4] pt-3 font-body text-xs italic text-[#547792]">
          The complete source code, mathematical methodologies, and datasets
          used in this research are open-sourced for academic transparency.
        </p>
      </div>
    </div>
  );
}

export function DocsClient() {
  const [activeTab, setActiveTab] = useState<DocTabId>("indicators");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="space-y-2">
        <div className="section-label">Reference Manual</div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center border-2 border-[#213448] bg-[#0a7c6e] text-white shadow-[3px_3px_0px_0px_rgba(33,52,72,0.2)]"
          >
            <BookOpen className="h-5 w-5" />
          </span>
          <h1 className="page-title m-0">Documentation</h1>
        </div>
        <p className="page-subtitle">
          Methodology · Indicator glossary · Metric definitions · Research
          disclaimer
        </p>
      </header>

      {/* 6 Interactive Brutalist Tabs */}
      <div
        role="tablist"
        aria-label="Documentation sections"
        className="flex flex-wrap gap-2 border-b-2 border-[#c9c2b8] pb-3"
      >
        {DOC_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "border-2 px-3.5 py-2 font-display text-xs font-semibold sm:text-sm transition-all cursor-pointer",
                isSelected
                  ? "border-[#0a7c6e] bg-[#0a7c6e] text-white shadow-[3px_3px_0px_0px_rgba(10,124,110,0.35)]"
                  : "border-[#c9c2b8] bg-white text-[#213448] hover:border-[#0a7c6e] hover:text-[#0a7c6e]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div role="tabpanel" className="brutal-card-static p-5 sm:p-7">
        {activeTab === "indicators" && <IndicatorsTab />}
        {activeTab === "logic" && <StrategyLogicTab />}
        {activeTab === "glossary" && <MetricGlossaryTab />}
        {activeTab === "methodology" && <ResearchMethodologyTab />}
        {activeTab === "disclaimer" && <DisclaimerTab />}
        {activeTab === "author" && <AuthorTab />}
      </div>
    </div>
  );
}
