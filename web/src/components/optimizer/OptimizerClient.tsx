"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Cpu,
  Info,
  ShieldCheck,
  Sliders,
  Terminal,
} from "lucide-react";
import { formatPercentage } from "@/lib/format";
import type { LiveObjectiveEntry, LiveOptimalParams } from "@/lib/types";

export interface OptimizerClientProps {
  liveParams: LiveOptimalParams | null;
}

type LiveObjectiveKey = "max_return" | "max_sharpe" | "min_drawdown";

interface ObjectiveCardMeta {
  key: LiveObjectiveKey;
  label: string;
  accentColor: string;
  borderClass: string;
}

const OBJECTIVE_CARDS: ObjectiveCardMeta[] = [
  {
    key: "max_return",
    label: "Max Return",
    accentColor: "#0a7c6e",
    borderClass: "border-l-[#0a7c6e]",
  },
  {
    key: "max_sharpe",
    label: "Max Sharpe",
    accentColor: "#0369a1",
    borderClass: "border-l-[#0369a1]",
  },
  {
    key: "min_drawdown",
    label: "Min Drawdown",
    accentColor: "#7c3aed",
    borderClass: "border-l-[#7c3aed]",
  },
];

function buildSimulatorHref(
  key: LiveObjectiveKey,
  entry: LiveObjectiveEntry
): string {
  const params = new URLSearchParams({
    preset: `live_${key}`,
    buy: String(Math.round(entry.threshold_buy)),
    sell: String(Math.round(entry.threshold_sell)),
    ab: String(Math.round(entry.allocation_buy_pct * 100)),
    as: String(Math.round(entry.allocation_sell_pct * 100)),
  });
  return `/simulator?${params.toString()}`;
}

export function OptimizerClient({ liveParams }: OptimizerClientProps) {
  const [explainerOpen, setExplainerOpen] = useState(false);

  const hasLiveParams =
    liveParams !== null && liveParams.status === "success";

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="space-y-2">
        <div className="section-label">BTC Strategy Lab</div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center border-2 border-[#213448] bg-[#0a7c6e] text-white shadow-[3px_3px_0px_0px_rgba(33,52,72,0.2)]"
          >
            <Sliders className="h-5 w-5" />
          </span>
          <h1 className="page-title m-0">Dynamic Parameter Optimizer</h1>
        </div>
        <p className="page-subtitle max-w-2xl">
          Inspect strategy parameters optimized against{" "}
          <strong>fresh live BTC price data</strong> (Yahoo Finance) with the
          signal computed via independent logarithmic regression. No reliance on
          the CBBI API: signal values are deterministic and reproducible.
        </p>
      </header>

      {/* Research Scope Note Banner */}
      <div className="brutal-info-strip flex items-start gap-2.5">
        <Info
          className="mt-0.5 h-4 w-4 shrink-0 text-[#0369a1]"
          aria-hidden="true"
        />
        <p className="m-0 font-body text-sm leading-relaxed">
          <strong>Research Scope Note:</strong> The academic backtest used a
          frozen snapshot. This optimizer is a <em>practical extension</em>{" "}
          outside that scope. Results here are for live deployment only, not for
          comparing against the IS/OOS research findings.
        </p>
      </div>

      <hr className="brutal-divider" />

      {/* 4 Search Space Summary Cards */}
      <section aria-label="Grid search space summary">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="brutal-card-static p-4">
            <div className="metric-label">Buy Thresholds</div>
            <div className="metric-value">45</div>
            <div className="metric-subtext">1 → 45 (step 1)</div>
          </div>

          <div className="brutal-card-static p-4">
            <div className="metric-label">Sell Thresholds</div>
            <div className="metric-value">46</div>
            <div className="metric-subtext">55 → 100 (step 1)</div>
          </div>

          <div className="brutal-card-static p-4">
            <div className="metric-label">Allocation Steps</div>
            <div className="metric-value">25 × 25</div>
            <div className="metric-subtext">Buy &amp; Sell independently</div>
          </div>

          <div className="brutal-card-static p-4">
            <div className="metric-label">Total Combinations</div>
            <div className="metric-value">1,293,750</div>
            <div className="metric-subtext">O(1)-RAM streaming Numba</div>
          </div>
        </div>
      </section>

      {/* Current Live Parameters */}
      <section aria-labelledby="live-params-heading" className="space-y-5">
        <div>
          <div className="section-label">Latest Published Artifacts</div>
          <h2
            id="live-params-heading"
            className="font-display text-2xl font-bold text-[#213448]"
          >
            Current Live Parameters
          </h2>
        </div>

        {hasLiveParams ? (
          <div className="space-y-5">
            {/* Last Optimization Run */}
            <div className="brutal-card-static p-5">
              <div className="metric-label">Last Optimization Run</div>
              <div className="metric-value text-xl text-[#213448]">
                {liveParams.generated_at}
              </div>
              <div className="metric-subtext">
                Trained on: {liveParams.data_date_range} &nbsp;·&nbsp;{" "}
                {liveParams.total_combinations.toLocaleString("en-US")}{" "}
                combinations &nbsp;·&nbsp; {liveParams.elapsed_seconds}s runtime
              </div>
            </div>

            {/* 3 Objective Cards */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {OBJECTIVE_CARDS.map(({ key, label, borderClass }) => {
                const entry = liveParams[key];
                const abPct = Math.round(entry.allocation_buy_pct * 100);
                const asPct = Math.round(entry.allocation_sell_pct * 100);
                const ddStr = `-${(Math.abs(entry.max_drawdown) * 100).toFixed(
                  1
                )}%`;

                return (
                  <div
                    key={key}
                    className={`brutal-card flex flex-col justify-between border-l-4 ${borderClass} p-5`}
                  >
                    <div>
                      <div className="metric-label">{label}</div>
                      <div className="mt-2 space-y-1.5 font-body text-sm text-[#213448]">
                        <div>
                          <strong>
                            Buy ≤ {Math.round(entry.threshold_buy)}
                          </strong>{" "}
                          &nbsp;|&nbsp;{" "}
                          <strong>
                            Sell ≥ {Math.round(entry.threshold_sell)}
                          </strong>
                        </div>
                        <div className="text-[#547792]">
                          Alloc: {abPct}% buy / {asPct}% sell
                        </div>
                        <div className="pt-1">
                          Return:{" "}
                          <strong className="text-[#0a7c6e]">
                            {formatPercentage(entry.total_return * 100)}
                          </strong>{" "}
                          &nbsp;·&nbsp; Sharpe:{" "}
                          <strong>{entry.sharpe_ratio.toFixed(2)}</strong>
                        </div>
                        <div>
                          Drawdown: <strong>{ddStr}</strong> &nbsp;·&nbsp;
                          Trades:{" "}
                          <strong>
                            {Math.trunc(entry.trade_count).toLocaleString(
                              "en-US"
                            )}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={buildSimulatorHref(key, entry)}
                      className="brutal-btn-primary mt-5 w-full justify-center text-sm no-underline"
                    >
                      <span>Open in Simulator</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="brutal-disclosure flex items-start gap-2.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[#92400e]"
              aria-hidden="true"
            />
            <p className="m-0 font-body text-sm">
              No live optimization artifact is currently published. Run the
              offline Python pipeline below to generate{" "}
              <code>live_optimal_params.json</code>.
            </p>
          </div>
        )}
      </section>

      <hr className="brutal-divider" />

      {/* Offline & Automated Re-Optimization Card */}
      <section aria-labelledby="reopt-heading">
        <div className="brutal-card-static border-l-4 border-l-[#0a7c6e] p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Cpu className="h-5 w-5 text-[#0a7c6e]" aria-hidden="true" />
              <h2
                id="reopt-heading"
                className="font-display text-lg font-bold text-[#213448]"
              >
                Offline &amp; Automated Re-Optimization
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 border-2 border-[#0a7c6e] bg-[#0a7c6e]/10 px-2.5 py-0.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#0a7c6e]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Serverless &amp; DoS-Immune
            </span>
          </div>

          <p className="mb-4 font-body text-sm leading-relaxed text-[#213448]">
            The exhaustive <strong>1,293,750-combination</strong> Numba JIT
            grid search runs via the Python CLI or scheduled CI rather than
            Vercel serverless functions. Keeping heavy optimization offline keeps
            this web application 100% serverless, fast, deterministic, and
            immune to public CPU/RAM denial-of-service.
          </p>

          <div className="border-2 border-[#213448] bg-[#213448] p-3.5 text-white">
            <div className="mb-1.5 flex items-center gap-2 font-label text-[11px] font-bold uppercase tracking-wider text-[#94b4c1]">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Regenerate &amp; Export Pipeline</span>
            </div>
            <code className="block overflow-x-auto font-mono text-xs text-[#fff8f1]">
              python scripts/regenerate_artifacts.py &amp;&amp; python
              scripts/export_web_data.py
            </code>
          </div>
        </div>
      </section>

      {/* Expandable Index Revision Bias Explainer */}
      <section aria-label="Why independent calculation was chosen">
        <div className="brutal-card-static">
          <button
            type="button"
            aria-expanded={explainerOpen}
            onClick={() => setExplainerOpen((prev) => !prev)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 bg-[#ede8e0] px-5 py-3.5 text-left font-display text-sm font-bold text-[#213448] transition-colors hover:bg-[#e5dfd5]"
          >
            <span className="flex items-center gap-2.5">
              <BookOpen className="h-4 w-4 text-[#0a7c6e]" aria-hidden="true" />
              <span>Why independent calculation was chosen</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${
                explainerOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {explainerOpen && (
            <div className="space-y-3 border-t-2 border-[#c9c2b8] p-5 font-body text-sm leading-relaxed text-[#213448]">
              <p>
                <strong>Colin&apos;s CBBI is not static.</strong> When he adds,
                removes, or modifies an indicator (e.g., removing Stock-to-Flow,
                reweighting Pi Cycle), his algorithm retroactively recalculates
                the entire CBBI history back to 2011.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  The score for <code>2021-01-01</code> in our frozen{" "}
                  <code>master_dataset.parquet</code> is <strong>63.65</strong>
                </li>
                <li>
                  The same date via the live CBBI API (2026-04-17) was{" "}
                  <strong>78.13</strong>
                </li>
              </ul>
              <p>
                <strong>A 14.5-point drift on one day.</strong> Across
                thousands of days, this shifts when every single buy/sell signal
                fires.
              </p>
              <p>
                <strong>The solution:</strong> Instead of fetching from the CBBI
                API, the Logarithmic Regression indicator is computed{" "}
                <strong>independently</strong> from BTC price data using a
                power-law logarithmic regression model (
                <code>core/trolololo.py</code> / <code>src/lib/trolololo.ts</code>
                ). This formula is deterministic — it produces the same value
                for any given BTC price history, regardless of what changes on{" "}
                <code>cbbi.info</code>.
              </p>
              <p className="border-t border-[#d4cdc4] pt-3 text-xs text-[#547792]">
                <em>For the academic research paper</em>, this phenomenon is
                documented as a limitation under &ldquo;Index Revision
                Risk.&rdquo; The frozen dataset remains the canonical research
                artifact — it is reproducible. This optimizer is the practical
                deployment solution.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
