"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Download,
  FlaskConical,
  Info,
} from "lucide-react";
import { ComparisonBarChart } from "@/components/charts/ComparisonBarChart";
import { DegradationBarChart } from "@/components/charts/DegradationBarChart";
import { IsOosEquityChart } from "@/components/charts/IsOosEquityChart";
import { SensitivityHeatmapChart } from "@/components/charts/SensitivityHeatmapChart";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { runBacktestFull } from "@/lib/engine";
import { formatPercentage } from "@/lib/format";
import {
  OBJECTIVE_KEYS,
  type ColumnarDataset,
  type HeatmapMatrix,
  type ObjectiveKey,
  type ResearchObjectiveEntry,
  type ResearchSummary,
  type Top100Trial,
} from "@/lib/types";

export interface ResearchClientProps {
  results: ResearchSummary;
  masterDataset: ColumnarDataset;
  s1Heatmap: HeatmapMatrix;
  s2Heatmap: HeatmapMatrix;
  s1Top100: Top100Trial[];
  s2Top100: Top100Trial[];
}

const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  max_return: "Max Return",
  min_drawdown: "Min Drawdown",
  max_sharpe: "Max Sharpe",
};

const DEFAULT_SIM_PARAMS = {
  initialCash: 100_000,
  feeRate: 0.001,
} as const;

function getDegradationBadge(pct: number): {
  label: string;
  dotClass: string;
  pillClass: string;
} {
  const absPct = Math.abs(pct);
  if (absPct < 20) {
    return {
      label: "Robust",
      dotClass: "bg-[#16a34a]",
      pillClass: "border-[#16a34a] bg-[#f0fdf4] text-[#14532d]",
    };
  }
  if (absPct < 40) {
    return {
      label: "Moderate",
      dotClass: "bg-[#d97706]",
      pillClass: "border-[#d97706] bg-[#fffbeb] text-[#78350f]",
    };
  }
  return {
    label: "Overfit",
    dotClass: "bg-[#dc2626]",
    pillClass: "border-[#dc2626] bg-[#fff5f5] text-[#7f1d1d]",
  };
}

function runResearchPreset(
  dataset: ColumnarDataset,
  entry: ResearchObjectiveEntry
) {
  return runBacktestFull(dataset, {
    thresholdBuy: Math.round(entry.threshold_buy),
    thresholdSell: Math.round(entry.threshold_sell),
    allocBuyPct: entry.allocation_buy_pct,
    allocSellPct: entry.allocation_sell_pct,
    initialCash: DEFAULT_SIM_PARAMS.initialCash,
    feeRate: DEFAULT_SIM_PARAMS.feeRate,
  });
}

function serializeTop100Csv(rows: Top100Trial[]): string {
  const plainRows = rows.map((row) => ({
    threshold_buy: row.threshold_buy,
    threshold_sell: row.threshold_sell,
    allocation_buy_pct: row.allocation_buy_pct,
    allocation_sell_pct: row.allocation_sell_pct,
    total_return: row.total_return,
    max_drawdown: row.max_drawdown,
    sharpe_ratio: row.sharpe_ratio,
    win_rate: row.win_rate,
    trade_count: row.trade_count,
  }));
  return toCsv(plainRows, [
    "threshold_buy",
    "threshold_sell",
    "allocation_buy_pct",
    "allocation_sell_pct",
    "total_return",
    "max_drawdown",
    "sharpe_ratio",
    "win_rate",
    "trade_count",
  ]);
}

function ObjectiveTabs({
  active,
  onChange,
  label,
}: {
  active: ObjectiveKey;
  onChange: (key: ObjectiveKey) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mb-5 flex flex-wrap gap-2 border-b-2 border-[#c9c2b8] pb-3"
    >
      {OBJECTIVE_KEYS.map((key) => {
        const isSelected = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(key)}
            className={[
              "border-2 px-4 py-2 font-display text-sm font-semibold transition-all cursor-pointer",
              isSelected
                ? "border-[#0a7c6e] bg-[#0a7c6e] text-white shadow-[3px_3px_0px_0px_rgba(10,124,110,0.35)]"
                : "border-[#c9c2b8] bg-white text-[#213448] hover:border-[#0a7c6e] hover:text-[#0a7c6e]",
            ].join(" ")}
          >
            {OBJECTIVE_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}

function OptimalParamsTable({ entry }: { entry: ResearchObjectiveEntry }) {
  const rows = [
    { label: "Buy Threshold", value: String(Math.round(entry.threshold_buy)) },
    { label: "Sell Threshold", value: String(Math.round(entry.threshold_sell)) },
    {
      label: "Buy Allocation",
      value: `${(entry.allocation_buy_pct * 100).toFixed(0)}%`,
    },
    {
      label: "Sell Allocation",
      value: `${(entry.allocation_sell_pct * 100).toFixed(0)}%`,
    },
  ];

  return (
    <div className="brutal-table-wrap max-w-md">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-[#c9c2b8] bg-[#ede8e0]">
            <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
              Parameter
            </th>
            <th className="px-4 py-2.5 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className="border-b border-[#d4cdc4] last:border-b-0"
            >
              <td className="px-4 py-2 font-body font-medium text-[#213448]">
                {row.label}
              </td>
              <td className="px-4 py-2 font-display font-bold text-[#0a7c6e]">
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricStatRow({
  label,
  value,
  accentClass = "text-[#213448]",
}: {
  label: string;
  value: string;
  accentClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#d4cdc4] py-2 last:border-b-0">
      <span className="font-label text-[11px] font-semibold uppercase tracking-wider text-[#547792]">
        {label}
      </span>
      <span className={`font-display text-base font-bold ${accentClass}`}>
        {value}
      </span>
    </div>
  );
}

export function ResearchClient({
  results,
  masterDataset,
  s1Heatmap,
  s2Heatmap,
  s1Top100,
  s2Top100,
}: ResearchClientProps) {
  const [scenariosExpanded, setScenariosExpanded] = useState(false);
  const [s1Tab, setS1Tab] = useState<ObjectiveKey>("max_return");
  const [s2Tab, setS2Tab] = useState<ObjectiveKey>("max_return");

  const s1 = results.scenario_1;
  const s2 = results.scenario_2;
  const bh = results.buy_and_hold_benchmark;

  const s1IsData = s1.in_sample[s1Tab];
  const s1OosData = s1.out_of_sample[s1Tab];
  const s1DegData = s1.degradation[s1Tab];
  const s1Badge = getDegradationBadge(s1DegData.return_degradation_pct);

  const s2FullData = s2.full_dataset[s2Tab];

  const s1SimResult = useMemo(
    () => runResearchPreset(masterDataset, s1IsData),
    [masterDataset, s1IsData]
  );

  const s2SimResult = useMemo(
    () => runResearchPreset(masterDataset, s2FullData),
    [masterDataset, s2FullData]
  );

  const s1OosMaxReturn = s1.out_of_sample.max_return;
  const s2FullMaxReturn = s2.full_dataset.max_return;
  const bhOos = bh.out_of_sample;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <header className="space-y-2">
        <div className="section-label">Phase 3 Optimization Outcomes</div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center border-2 border-[#213448] bg-[#0a7c6e] text-white shadow-[3px_3px_0px_0px_rgba(33,52,72,0.2)]"
          >
            <FlaskConical className="h-5 w-5" />
          </span>
          <h1 className="page-title m-0">Research Results</h1>
        </div>
        <p className="page-subtitle">
          Phase 3 optimization outcomes ·{" "}
          {results.metadata.total_trials_per_run.toLocaleString("en-US")} trials
          per scenario · Generated: {results.metadata.generated_at}
        </p>
      </header>

      {/* Expandable Scenario Explainer */}
      <section aria-label="Understanding the two scenarios">
        <div className="brutal-card-static">
          <button
            type="button"
            aria-expanded={scenariosExpanded}
            onClick={() => setScenariosExpanded((prev) => !prev)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 bg-[#ede8e0] px-5 py-3.5 text-left font-display text-sm font-bold text-[#213448] transition-colors hover:bg-[#e5dfd5]"
          >
            <span className="flex items-center gap-2.5">
              <BookOpen className="h-4 w-4 text-[#0a7c6e]" aria-hidden="true" />
              <span>Understanding the Two Scenarios</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${
                scenariosExpanded ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {scenariosExpanded && (
            <div className="grid grid-cols-1 gap-6 border-t-2 border-[#c9c2b8] p-5 md:grid-cols-2">
              <div className="space-y-2">
                <h2 className="font-display text-base font-bold text-[#0a7c6e]">
                  Scenario 1: Academic Validation
                </h2>
                <ul className="list-disc space-y-1.5 pl-5 font-body text-sm text-[#213448]">
                  <li>
                    Optimization runs on <strong>2012–2020</strong> data only
                    (In-Sample)
                  </li>
                  <li>
                    Optimal parameters are then tested on{" "}
                    <strong>2021–2026</strong> data (Out-of-Sample)
                  </li>
                  <li>
                    No lookahead bias: OOS data was never seen during
                    optimization
                  </li>
                  <li>
                    Purpose: prove strategy robustness and generalizability
                  </li>
                  <li>Signal: Logarithmic Regression</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-base font-bold text-[#0369a1]">
                  Scenario 2: Maximum Exploration
                </h2>
                <ul className="list-disc space-y-1.5 pl-5 font-body text-sm text-[#213448]">
                  <li>
                    Optimization runs on the <strong>full 2012–2026</strong>{" "}
                    dataset
                  </li>
                  <li>
                    No train/test split: all data used for optimization
                  </li>
                  <li>
                    Contains lookahead bias <strong>by design</strong>
                  </li>
                  <li>
                    Purpose: map the absolute performance ceiling of the
                    indicator
                  </li>
                  <li>
                    Useful as a reference point, not a tradeable strategy
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* Scenario 1 — Academic Validation */}
      <section aria-labelledby="s1-heading" className="space-y-5">
        <div>
          <div className="section-label">Out-of-Sample Validation</div>
          <h2
            id="s1-heading"
            className="font-display text-2xl font-bold text-[#213448]"
          >
            Scenario 1 — Academic Validation Approach
          </h2>
        </div>

        <ObjectiveTabs
          active={s1Tab}
          onChange={setS1Tab}
          label="Scenario 1 objective selector"
        />

        <div className="space-y-5">
          <div>
            <h3 className="mb-2.5 font-display text-sm font-bold text-[#213448]">
              Optimal Parameters (from In-Sample optimization)
            </h3>
            <OptimalParamsTable entry={s1IsData} />
          </div>

          {/* 3-Column IS / OOS / Degradation Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* In-Sample */}
            <div className="brutal-card-static border-l-4 border-l-[#0a7c6e] p-4">
              <div className="mb-2 font-display text-sm font-bold text-[#213448]">
                In-Sample (2012–2020)
              </div>
              <MetricStatRow
                label="Total Return"
                value={formatPercentage(s1IsData.total_return * 100)}
                accentClass="text-[#0a7c6e]"
              />
              <MetricStatRow
                label="Max Drawdown"
                value={`${(s1IsData.max_drawdown * 100).toFixed(1)}%`}
              />
              <MetricStatRow
                label="Sharpe Ratio"
                value={s1IsData.sharpe_ratio.toFixed(3)}
              />
              <MetricStatRow
                label="Win Rate"
                value={`${(s1IsData.win_rate * 100).toFixed(1)}%`}
              />
              <MetricStatRow
                label="Trade Count"
                value={Math.trunc(s1IsData.trade_count).toLocaleString("en-US")}
              />
            </div>

            {/* Out-of-Sample */}
            <div className="brutal-card-static border-l-4 border-l-[#0369a1] p-4">
              <div className="mb-2 font-display text-sm font-bold text-[#213448]">
                Out-of-Sample (2021–2026)
              </div>
              <MetricStatRow
                label="Total Return"
                value={formatPercentage(s1OosData.total_return * 100)}
                accentClass="text-[#0369a1]"
              />
              <MetricStatRow
                label="Max Drawdown"
                value={`${(s1OosData.max_drawdown * 100).toFixed(1)}%`}
              />
              <MetricStatRow
                label="Sharpe Ratio"
                value={s1OosData.sharpe_ratio.toFixed(3)}
              />
              <MetricStatRow
                label="Win Rate"
                value={`${(s1OosData.win_rate * 100).toFixed(1)}%`}
              />
              <MetricStatRow
                label="Trade Count"
                value={Math.trunc(s1OosData.trade_count).toLocaleString("en-US")}
              />

              {s1OosData.trade_count === 0 ? (
                <div className="mt-3 border-l-4 border-[#0a7c6e] bg-[#0a7c6e]/10 p-3 font-body text-xs leading-relaxed text-[#213448]">
                  <div className="mb-1 font-display font-bold text-[#0a7c6e]">
                    No OOS trades triggered with independent Logarithmic
                    Regression
                  </div>
                  The optimal buy threshold is{" "}
                  <strong>{Math.round(s1IsData.threshold_buy)}</strong> (Index
                  ≤ {Math.round(s1IsData.threshold_buy)}%). With the
                  independently computed Logarithmic Regression (immutable
                  pre-2026 confirmed cycle-mark calibration), the signal never
                  fell below this threshold during the OOS period (2021–2026).
                  No buy signals means no sell signals, so all metrics show 0.
                </div>
              ) : s1OosData.trade_count < 10 ? (
                <div className="brutal-warn-badge mt-3">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Low trade count</span>
                </div>
              ) : null}
            </div>

            {/* Degradation */}
            <div className="brutal-card-static border-l-4 border-l-[#d97706] p-4">
              <div className="mb-2 font-display text-sm font-bold text-[#213448]">
                IS → OOS Degradation
              </div>
              <MetricStatRow
                label="Return Degradation"
                value={`${s1DegData.return_degradation_pct.toFixed(1)}%`}
              />
              <MetricStatRow
                label="Sharpe Degradation"
                value={`${s1DegData.sharpe_degradation_pct.toFixed(1)}%`}
              />
              <MetricStatRow
                label="Drawdown Change"
                value={`${s1DegData.drawdown_degradation_pct.toFixed(1)}%`}
              />
              <div className="mt-4 flex items-center justify-between pt-2">
                <span className="font-label text-[11px] font-semibold uppercase tracking-wider text-[#547792]">
                  Overall Assessment
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 border-2 px-2.5 py-0.5 font-display text-xs font-bold ${s1Badge.pillClass}`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full ${s1Badge.dotClass}`}
                  />
                  {s1Badge.label}
                </span>
              </div>
            </div>
          </div>

          {/* Buy & Hold benchmark caption */}
          <div className="brutal-info-strip flex items-center gap-2 font-body text-xs">
            <Info
              className="h-4 w-4 shrink-0 text-[#0369a1]"
              aria-hidden="true"
            />
            <span>
              <strong>Buy &amp; Hold benchmark:</strong> IS:{" "}
              <strong>{formatPercentage(bh.in_sample.total_return * 100)}</strong>{" "}
              | OOS:{" "}
              <strong>
                {formatPercentage(bh.out_of_sample.total_return * 100)}
              </strong>{" "}
              | Full:{" "}
              <strong>
                {formatPercentage(bh.full_dataset.total_return * 100)}
              </strong>
            </span>
          </div>

          {/* IS vs OOS Equity Curve */}
          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold text-[#213448]">
              Equity Curve: In-Sample vs Out-of-Sample
            </h3>
            <div className="brutal-card-static p-3">
              <IsOosEquityChart
                result={s1SimResult}
                title={`Strategy Equity (${OBJECTIVE_LABELS[s1Tab]})`}
              />
            </div>
          </div>
        </div>

        {/* Degradation Bar Chart */}
        <div className="space-y-2 pt-2">
          <h3 className="font-display text-sm font-bold text-[#213448]">
            IS → OOS Degradation by Objective
          </h3>
          <div className="brutal-card-static p-3">
            <DegradationBarChart degradation={s1.degradation} />
          </div>
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* Scenario 2 — Maximum Exploration */}
      <section aria-labelledby="s2-heading" className="space-y-5">
        <div>
          <div className="section-label">Full-Sample Ceiling</div>
          <h2
            id="s2-heading"
            className="font-display text-2xl font-bold text-[#213448]"
          >
            Scenario 2: Maximum Exploration Approach
          </h2>
        </div>

        {/* Mandatory disclosure box BEFORE any numbers */}
        <div className="brutal-disclosure" role="note" aria-label="Important disclosure">
          <div className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-[#92400e]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>IMPORTANT DISCLOSURE</span>
          </div>
          <p className="mb-2">
            The following results were obtained by optimizing across the{" "}
            <strong>entire historical dataset (2012–2026)</strong>. This
            process uses what is known as <em>lookahead bias</em>: the optimizer
            had access to data that would not have been available at the time of
            trading.
          </p>
          <p>
            These configurations{" "}
            <strong>cannot be used as predictive trading signals</strong>. The
            sole purpose of Scenario 2 is to map the{" "}
            <strong>absolute historical performance ceiling</strong> of the
            Logarithmic Regression indicator, representing the best a strategy{" "}
            <em>could have done</em> with perfect hindsight. This serves as an
            academic reference point, not a tradeable result.
          </p>
        </div>

        <ObjectiveTabs
          active={s2Tab}
          onChange={setS2Tab}
          label="Scenario 2 objective selector"
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2.5 font-display text-sm font-bold text-[#213448]">
                Optimal Parameters (Full Dataset)
              </h3>
              <OptimalParamsTable entry={s2FullData} />
            </div>

            <div className="brutal-card-static border-l-4 border-l-[#0369a1] p-4">
              <div className="mb-2 font-display text-sm font-bold text-[#213448]">
                Full Dataset Metrics (2012–2026)
              </div>
              <MetricStatRow
                label="Total Return"
                value={formatPercentage(s2FullData.total_return * 100)}
                accentClass="text-[#0369a1]"
              />
              <MetricStatRow
                label="Max Drawdown"
                value={`${(s2FullData.max_drawdown * 100).toFixed(1)}%`}
              />
              <MetricStatRow
                label="Sharpe Ratio"
                value={s2FullData.sharpe_ratio.toFixed(3)}
              />
              <MetricStatRow
                label="Win Rate"
                value={`${(s2FullData.win_rate * 100).toFixed(1)}%`}
              />
              <MetricStatRow
                label="Trade Count"
                value={Math.trunc(s2FullData.trade_count).toLocaleString(
                  "en-US"
                )}
              />
            </div>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <h3 className="font-display text-sm font-bold text-[#213448]">
              Equity Curve (Full Dataset 2012–2026)
            </h3>
            <div className="brutal-card-static p-3">
              <IsOosEquityChart
                result={s2SimResult}
                title={`Scenario 2 Equity (${OBJECTIVE_LABELS[s2Tab]})`}
              />
            </div>
          </div>
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* Overall Comparison */}
      <section aria-labelledby="comparison-heading" className="space-y-5">
        <div>
          <div className="section-label">Cross-Scenario Benchmark</div>
          <h2
            id="comparison-heading"
            className="font-display text-2xl font-bold text-[#213448]"
          >
            Overall Comparison
          </h2>
        </div>

        <div className="brutal-table-wrap">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-[#c9c2b8] bg-[#ede8e0]">
                <th className="px-4 py-3 font-label text-[11px] font-bold uppercase tracking-wider text-[#547792]">
                  Metric
                </th>
                <th className="px-4 py-3 font-label text-[11px] font-bold uppercase tracking-wider text-[#0a7c6e]">
                  Scenario 1 (OOS, Validated)
                </th>
                <th className="px-4 py-3 font-label text-[11px] font-bold uppercase tracking-wider text-[#0369a1]">
                  Scenario 2 (Full, Exploration)
                </th>
                <th className="px-4 py-3 font-label text-[11px] font-bold uppercase tracking-wider text-[#d97706]">
                  Buy &amp; Hold (OOS period)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2.5 font-body font-semibold text-[#213448]">
                  Total Return
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#0a7c6e]">
                  {formatPercentage(s1OosMaxReturn.total_return * 100)}
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#0369a1]">
                  {formatPercentage(s2FullMaxReturn.total_return * 100)}
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#d97706]">
                  {formatPercentage(bhOos.total_return * 100)}
                </td>
              </tr>
              <tr className="border-b border-[#d4cdc4]">
                <td className="px-4 py-2.5 font-body font-semibold text-[#213448]">
                  Max Drawdown
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#213448]">
                  {(s1OosMaxReturn.max_drawdown * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#213448]">
                  {(s2FullMaxReturn.max_drawdown * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#213448]">
                  {(bhOos.max_drawdown * 100).toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5 font-body font-semibold text-[#213448]">
                  Sharpe Ratio
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#213448]">
                  {s1OosMaxReturn.sharpe_ratio.toFixed(3)}
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#213448]">
                  {s2FullMaxReturn.sharpe_ratio.toFixed(3)}
                </td>
                <td className="px-4 py-2.5 font-display font-bold text-[#213448]">
                  {bhOos.sharpe_ratio.toFixed(3)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="brutal-card-static p-3">
          <ComparisonBarChart results={results} />
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* Parameter Sensitivity Heatmaps */}
      <section aria-labelledby="heatmaps-heading" className="space-y-4">
        <div>
          <div className="section-label">Grid Search Landscape</div>
          <h2
            id="heatmaps-heading"
            className="font-display text-2xl font-bold text-[#213448]"
          >
            Parameter Sensitivity Heatmaps
          </h2>
          <p className="page-subtitle mt-1">
            Each cell shows the maximum total return achievable at that (Buy
            Threshold, Sell Threshold) combination, across all allocation
            percentages. Pre-aggregated from{" "}
            {results.metadata.total_trials_per_run.toLocaleString("en-US")}{" "}
            parameter combinations.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold text-[#213448]">
              Scenario 1 — In-Sample Sensitivity
            </h3>
            <div className="brutal-card-static p-3">
              <SensitivityHeatmapChart
                matrix={s1Heatmap}
                title="S1 In-Sample: Total Return by Threshold Pair"
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold text-[#213448]">
              Scenario 2 — Full Dataset Sensitivity
            </h3>
            <div className="brutal-card-static p-3">
              <SensitivityHeatmapChart
                matrix={s2Heatmap}
                title="S2 Full Dataset: Total Return by Threshold Pair"
              />
            </div>
          </div>
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* Export Data Panel */}
      <section aria-labelledby="export-heading" className="space-y-4">
        <div>
          <div className="section-label">Reproducible Artifacts</div>
          <h2
            id="export-heading"
            className="font-display text-2xl font-bold text-[#213448]"
          >
            Export Data
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                JSON.stringify(results, null, 2),
                "optimal_params_summary.json",
                "application/json;charset=utf-8"
              )
            }
            className="brutal-btn w-full justify-center py-3 text-sm"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>optimal_params_summary.json</span>
          </button>

          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                serializeTop100Csv(s1Top100),
                "scenario1_top100_max_return.csv",
                "text/csv;charset=utf-8"
              )
            }
            className="brutal-btn w-full justify-center py-3 text-sm"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>scenario1_top100_max_return.csv</span>
          </button>

          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                serializeTop100Csv(s2Top100),
                "scenario2_top100_max_return.csv",
                "text/csv;charset=utf-8"
              )
            }
            className="brutal-btn w-full justify-center py-3 text-sm"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>scenario2_top100_max_return.csv</span>
          </button>
        </div>
      </section>
    </div>
  );
}
