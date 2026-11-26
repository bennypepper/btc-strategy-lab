"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Scale,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { EquityCurveChart } from "@/components/charts/EquityCurveChart";
import { SignalIndexChart } from "@/components/charts/SignalIndexChart";
import { Tooltip } from "@/components/Tooltip";
import { useMarketData } from "@/hooks/useMarketData";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { runBacktestFull, sliceDataset } from "@/lib/engine";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/format";
import type {
  ColumnarDataset,
  LiveOptimalParams,
  ObjectiveKey,
  ResearchSummary,
  SimulationResult,
} from "@/lib/types";

export interface SimulatorClientProps {
  initialData: ColumnarDataset;
  research: ResearchSummary;
  liveParams: LiveOptimalParams | null;
}

type PresetId =
  | "hist_max_return"
  | "hist_min_drawdown"
  | "hist_max_sharpe"
  | "live_max_return"
  | "live_min_drawdown"
  | "live_max_sharpe"
  | "custom";

type ActionFilter = "ALL" | "BUY" | "SELL";
type RowLimitOption = "50" | "100" | "250" | "ALL";

interface PresetDefinition {
  id: PresetId;
  label: string;
  shortName: string;
  kind: "historical" | "live" | "custom";
  thresholdBuy: number;
  thresholdSell: number;
  allocBuyPct: number;
  allocSellPct: number;
}

const FALLBACK_PRESET_PARAMS: Record<
  ObjectiveKey,
  { thresholdBuy: number; thresholdSell: number; allocBuyPct: number; allocSellPct: number }
> = {
  max_return: { thresholdBuy: 7, thresholdSell: 96, allocBuyPct: 25, allocSellPct: 14 },
  min_drawdown: { thresholdBuy: 1, thresholdSell: 64, allocBuyPct: 1, allocSellPct: 23 },
  max_sharpe: { thresholdBuy: 4, thresholdSell: 59, allocBuyPct: 25, allocSellPct: 3 },
};

const CUSTOM_DEFAULTS = {
  thresholdBuy: 20,
  thresholdSell: 75,
  allocBuyPct: 10,
  allocSellPct: 10,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseIntParam(
  raw: string | null,
  min: number,
  max: number
): number | null {
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return clampInt(parsed, min, max);
}

function parseFloatParam(
  raw: string | null,
  min: number,
  max: number
): number | null {
  if (raw === null || raw.trim() === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return clampFloat(parsed, min, max);
}

function parseDateParam(
  raw: string | null,
  minDate: string,
  maxDate: string
): string | null {
  if (raw === null || !ISO_DATE_RE.test(raw.trim())) return null;
  const trimmed = raw.trim();
  const parsedMs = Date.parse(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(parsedMs)) return null;
  if (trimmed < minDate) return minDate;
  if (trimmed > maxDate) return maxDate;
  return trimmed;
}

function daysBetweenIso(startIso: string, endIso: string): number {
  const s = Date.parse(`${startIso}T00:00:00Z`);
  const e = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.round((e - s) / MS_PER_DAY);
}

function formatDisplayDate(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

function buildPresets(
  research: ResearchSummary,
  liveParams: LiveOptimalParams | null
): PresetDefinition[] {
  const fromHistorical = (
    key: ObjectiveKey,
    id: PresetId,
    label: string,
    shortName: string
  ): PresetDefinition => {
    const entry = research.scenario_2?.full_dataset?.[key];
    const fb = FALLBACK_PRESET_PARAMS[key];
    if (!entry) {
      return { id, label, shortName, kind: "historical", ...fb };
    }
    return {
      id,
      label,
      shortName,
      kind: "historical",
      thresholdBuy: clampInt(entry.threshold_buy, 1, 99),
      thresholdSell: clampInt(entry.threshold_sell, 2, 100),
      allocBuyPct: clampInt(entry.allocation_buy_pct * 100, 1, 100),
      allocSellPct: clampInt(entry.allocation_sell_pct * 100, 1, 100),
    };
  };

  const list: PresetDefinition[] = [
    fromHistorical(
      "max_return",
      "hist_max_return",
      "Maximum Return (Aggressive)",
      "Maximum Return"
    ),
    fromHistorical(
      "min_drawdown",
      "hist_min_drawdown",
      "Minimum Drawdown (Conservative)",
      "Minimum Drawdown"
    ),
    fromHistorical(
      "max_sharpe",
      "hist_max_sharpe",
      "Maximum Sharpe Ratio (Balanced)",
      "Maximum Sharpe Ratio"
    ),
  ];

  if (liveParams && liveParams.status === "success") {
    const liveEntries: Array<{
      id: PresetId;
      label: string;
      shortName: string;
      key: ObjectiveKey;
    }> = [
      {
        id: "live_max_return",
        label: "Live Optimized (Max Return)",
        shortName: "Live Max Return",
        key: "max_return",
      },
      {
        id: "live_min_drawdown",
        label: "Live Optimized (Min Drawdown)",
        shortName: "Live Min Drawdown",
        key: "min_drawdown",
      },
      {
        id: "live_max_sharpe",
        label: "Live Optimized (Max Sharpe)",
        shortName: "Live Max Sharpe",
        key: "max_sharpe",
      },
    ];

    for (const item of liveEntries) {
      const entry = liveParams[item.key];
      list.push({
        id: item.id,
        label: item.label,
        shortName: item.shortName,
        kind: "live",
        thresholdBuy: clampInt(entry.threshold_buy ?? 30, 1, 99),
        thresholdSell: clampInt(entry.threshold_sell ?? 65, 2, 100),
        allocBuyPct: clampInt((entry.allocation_buy_pct ?? 0.25) * 100, 1, 100),
        allocSellPct: clampInt(
          (entry.allocation_sell_pct ?? 0.25) * 100,
          1,
          100
        ),
      });
    }
  }

  list.push({
    id: "custom",
    label: "Custom (Manual Configuration)",
    shortName: "Custom",
    kind: "custom",
    ...CUSTOM_DEFAULTS,
  });

  return list;
}

function resolveInitialPresetId(
  rawPreset: string | null,
  presets: PresetDefinition[],
  hasParamOverrides: boolean
): PresetId {
  if (rawPreset) {
    const normalized = rawPreset.trim().toLowerCase();
    const aliasMap: Record<string, PresetId> = {
      hist_max_return: "hist_max_return",
      max_return: "hist_max_return",
      hist_min_drawdown: "hist_min_drawdown",
      min_drawdown: "hist_min_drawdown",
      hist_max_sharpe: "hist_max_sharpe",
      max_sharpe: "hist_max_sharpe",
      live_max_return: "live_max_return",
      live_min_drawdown: "live_min_drawdown",
      live_max_sharpe: "live_max_sharpe",
      custom: "custom",
    };
    const mapped = aliasMap[normalized];
    if (mapped && presets.some((p) => p.id === mapped)) {
      return mapped;
    }
  }
  return hasParamOverrides ? "custom" : "hist_max_return";
}

export function SimulatorClient({
  initialData,
  research,
  liveParams,
}: SimulatorClientProps) {
  const searchParams = useSearchParams();
  const { data, isLive, lastDate } = useMarketData(initialData);

  const presets = useMemo(
    () => buildPresets(research, liveParams),
    [research, liveParams]
  );

  const initialDataMin = initialData.dates[0] ?? "2012-01-01";
  const initialDataMax =
    initialData.dates[initialData.dates.length - 1] ?? "2026-03-15";

  const [initialUrlState] = useState(() => {
    const qBuy = parseIntParam(searchParams.get("buy"), 1, 99);
    const qSell = parseIntParam(searchParams.get("sell"), 2, 100);
    const qAb = parseIntParam(searchParams.get("ab"), 1, 100);
    const qAs = parseIntParam(searchParams.get("as"), 1, 100);
    const qCash = parseIntParam(searchParams.get("cash"), 1, 10_000_000);
    const qFee = parseFloatParam(searchParams.get("fee"), 0, 0.5);
    const qFrom = parseDateParam(
      searchParams.get("from"),
      initialDataMin,
      initialDataMax
    );
    const qTo = parseDateParam(
      searchParams.get("to"),
      initialDataMin,
      initialDataMax
    );

    const hasNumericOverrides =
      qBuy !== null || qSell !== null || qAb !== null || qAs !== null;
    const presetId = resolveInitialPresetId(
      searchParams.get("preset"),
      presets,
      hasNumericOverrides
    );
    const chosenPreset =
      presets.find((p) => p.id === presetId) ?? presets[0]!;

    return {
      presetId,
      thresholdBuy: qBuy ?? chosenPreset.thresholdBuy,
      thresholdSell: qSell ?? chosenPreset.thresholdSell,
      allocBuy: qAb ?? chosenPreset.allocBuyPct,
      allocSell: qAs ?? chosenPreset.allocSellPct,
      initialCash: qCash ?? 100_000,
      feePct: qFee !== null ? Number((Math.round(qFee * 20) / 20).toFixed(2)) : 0.1,
      startDate: qFrom ?? initialDataMin,
      endDateOverride: qTo,
    };
  });

  const [presetId, setPresetId] = useState<PresetId>(initialUrlState.presetId);
  const [thresholdBuy, setThresholdBuy] = useState<number>(
    initialUrlState.thresholdBuy
  );
  const [thresholdSell, setThresholdSell] = useState<number>(
    initialUrlState.thresholdSell
  );
  const [allocBuy, setAllocBuy] = useState<number>(initialUrlState.allocBuy);
  const [allocSell, setAllocSell] = useState<number>(initialUrlState.allocSell);
  const [startDate, setStartDate] = useState<string>(initialUrlState.startDate);
  const [endDateOverride, setEndDateOverride] = useState<string | null>(
    initialUrlState.endDateOverride
  );
  const [initialCash, setInitialCash] = useState<number>(
    initialUrlState.initialCash
  );
  const [feePct, setFeePct] = useState<number>(initialUrlState.feePct);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    initialUrlState.feePct !== 0.1
  );
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [rowLimit, setRowLimit] = useState<RowLimitOption>("100");

  const dataMin = data.dates[0] ?? "2012-01-01";
  const dataMax = lastDate || data.dates[data.dates.length - 1] || initialDataMax;
  const endDate =
    endDateOverride !== null
      ? endDateOverride > dataMax
        ? dataMax
        : endDateOverride < dataMin
          ? dataMin
          : endDateOverride
      : dataMax;

  const activePreset = useMemo(
    () => presets.find((p) => p.id === presetId) ?? presets[0]!,
    [presets, presetId]
  );

  const handlePresetChange = (nextId: PresetId) => {
    setPresetId(nextId);
    const chosen = presets.find((p) => p.id === nextId);
    if (chosen && chosen.id !== "custom") {
      setThresholdBuy(chosen.thresholdBuy);
      setThresholdSell(chosen.thresholdSell);
      setAllocBuy(chosen.allocBuyPct);
      setAllocSell(chosen.allocSellPct);
    }
  };

  const slicedDataset = useMemo(
    () => sliceDataset(data, startDate, endDate),
    [data, startDate, endDate]
  );

  const periodDays = useMemo(
    () => daysBetweenIso(startDate, endDate),
    [startDate, endDate]
  );

  const validationError = useMemo<string | null>(() => {
    if (thresholdBuy >= thresholdSell) {
      return "Buy Threshold must be less than Sell Threshold.";
    }
    if (startDate >= endDate) {
      return "Start date must be before end date.";
    }
    if (!Number.isFinite(initialCash) || initialCash < 1 || initialCash > 10_000_000) {
      return "Initial Capital must be between $1 and $10,000,000.";
    }
    if (slicedDataset.dates.length < 30) {
      return "Not enough data in the selected date range (minimum 30 trading days).";
    }
    return null;
  }, [thresholdBuy, thresholdSell, startDate, endDate, initialCash, slicedDataset.dates.length]);

  const { simResult, engineError } = useMemo<{
    simResult: SimulationResult | null;
    engineError: string | null;
  }>(() => {
    if (validationError !== null) {
      return { simResult: null, engineError: null };
    }
    try {
      const result = runBacktestFull(slicedDataset, {
        thresholdBuy,
        thresholdSell,
        allocBuyPct: allocBuy / 100,
        allocSellPct: allocSell / 100,
        initialCash,
        feeRate: feePct / 100,
      });
      return { simResult: result, engineError: null };
    } catch (err: unknown) {
      return {
        simResult: null,
        engineError:
          err instanceof Error ? err.message : "Unable to run backtest.",
      };
    }
  }, [
    validationError,
    slicedDataset,
    thresholdBuy,
    thresholdSell,
    allocBuy,
    allocSell,
    initialCash,
    feePct,
  ]);

  const handleCopyShareableLink = async () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams({
      buy: String(thresholdBuy),
      sell: String(thresholdSell),
      ab: String(allocBuy),
      as: String(allocSell),
      from: startDate,
      to: endDate,
      cash: String(Math.round(initialCash)),
      fee: feePct.toFixed(2),
      preset: presetId,
    });
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard API may be blocked in insecure or restricted frames
      setCopiedLink(false);
    }
  };

  const holdPct = Math.max(0, thresholdSell - thresholdBuy);
  const buyBarWidth = Math.min(Math.max(thresholdBuy, 0), 100);
  const holdBarWidth = Math.max(
    0,
    Math.min(100, thresholdSell) - buyBarWidth
  );
  const sellBarWidth = Math.max(0, 100 - buyBarWidth - holdBarWidth);

  const filteredTrades = useMemo(() => {
    if (!simResult) return [];
    const indexed = simResult.tradeLog.map((trade, idx) => ({
      tradeNumber: idx + 1,
      ...trade,
    }));
    if (actionFilter === "ALL") return indexed;
    return indexed.filter((row) => row.action === actionFilter);
  }, [simResult, actionFilter]);

  const visibleTrades = useMemo(() => {
    if (rowLimit === "ALL") return filteredTrades;
    const limit = Number(rowLimit);
    if (!Number.isFinite(limit) || filteredTrades.length <= limit) {
      return filteredTrades;
    }
    return filteredTrades.slice(filteredTrades.length - limit);
  }, [filteredTrades, rowLimit]);

  const handleExportCsv = () => {
    if (!simResult || simResult.tradeLog.length === 0) return;
    const csvRows = simResult.tradeLog.map((row) => ({
      Date: row.date,
      Action: row.action,
      "BTC Price": row.btcPrice,
      "Amount (USD)": row.amountUsd,
      "BTC Amount": row.btcAmount,
      "Signal Index": row.signalIndex,
      "Cash After": row.cashAfter,
      "BTC Held After": row.btcHeldAfter,
      "Equity After": row.equityAfter,
    }));
    const csvContent = toCsv(csvRows, [
      "Date",
      "Action",
      "BTC Price",
      "Amount (USD)",
      "BTC Amount",
      "Signal Index",
      "Cash After",
      "BTC Held After",
      "Equity After",
    ]);
    const slug =
      activePreset.shortName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "custom";
    downloadTextFile(
      csvContent,
      `sim_trade_log_${slug}.csv`,
      "text/csv;charset=utf-8"
    );
  };

  return (
    <div className="space-y-8">
      {/* ── Page Header ── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">⚡ Strategy Simulator</h1>
          <p className="page-subtitle mt-1.5">
            Run instant client-side backtests with custom parameters &middot;
            Signal: <strong>Logarithmic Regression Index</strong> &middot;
            Execution: T+1 open price &middot; Fee adjustable
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={[
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-2 px-2.5 py-1 font-label text-[11px] font-bold uppercase",
              isLive
                ? "border-[#0a7c6e] bg-[#0a7c6e]/10 text-[#0a7c6e]"
                : "border-[#c9c2b8] bg-[#ede8e0] text-[#547792]",
            ].join(" ")}
          >
            {isLive ? "Live Data" : "Snapshot"} &middot; {dataMax}
          </span>
        </div>
      </header>

      {/* ── Two-Column Simulator Workspace ── */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-12">
        {/* ══ LEFT: CONFIGURATION PANEL ══ */}
        <section
          aria-label="Simulation configuration"
          className="brutal-card-static space-y-5 p-5 sm:p-6 lg:col-span-5"
        >
          <div className="flex items-center justify-between border-b-2 border-[#d4cdc4] pb-3">
            <h2 className="font-display text-lg font-bold text-[#213448]">
              Configuration
            </h2>
            <button
              type="button"
              onClick={handleCopyShareableLink}
              className="brutal-btn px-3 py-1.5 text-xs"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#0a7c6e]" aria-hidden="true" />
                  <span>Copied Link</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy Shareable Link</span>
                </>
              )}
            </button>
          </div>

          {/* Preset Selector */}
          <div>
            <label
              htmlFor="sim-preset"
              className="metric-label block"
            >
              Optimization Target
            </label>
            <select
              id="sim-preset"
              value={presetId}
              onChange={(e) => handlePresetChange(e.target.value as PresetId)}
              className="w-full border-2 border-[#213448] bg-white px-3 py-2 font-body text-sm font-medium text-[#213448] shadow-[3px_3px_0px_0px_rgba(33,52,72,0.12)] focus:border-[#0a7c6e] focus:outline-none"
            >
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Preset Metadata Strip */}
          {activePreset.kind === "live" && liveParams ? (
            <div className="brutal-info-strip border-l-4 border-l-[#0a7c6e] text-xs leading-relaxed">
              <div className="font-display font-bold text-[#0a7c6e]">
                Live Optimized Parameters
              </div>
              <div className="mt-1 space-y-0.5 text-[#213448]">
                <div>
                  Generated: <strong>{liveParams.generated_at}</strong>
                </div>
                <div>
                  Trained on: <strong>{liveParams.data_date_range}</strong>
                </div>
                <div>
                  Buy &le; <strong>{activePreset.thresholdBuy}%</strong>
                  {" | "}Sell &ge; <strong>{activePreset.thresholdSell}%</strong>
                </div>
                <div>
                  Alloc: <strong>{activePreset.allocBuyPct}%</strong> buy /{" "}
                  <strong>{activePreset.allocSellPct}%</strong> sell
                </div>
              </div>
            </div>
          ) : activePreset.kind === "historical" ? (
            <div className="brutal-info-strip border-l-4 border-l-[#0a7c6e] text-xs leading-relaxed">
              <div className="font-display font-bold text-[#213448]">
                Optimal Grid Search Configuration: {activePreset.shortName}
              </div>
              <div className="mt-1 space-y-0.5 text-[#213448]">
                <div>
                  Buy Threshold: <strong>&le; {activePreset.thresholdBuy}%</strong>
                  {" | "}Sell Threshold:{" "}
                  <strong>&ge; {activePreset.thresholdSell}%</strong>
                </div>
                <div>
                  Buy Alloc: <strong>{activePreset.allocBuyPct}%</strong> of
                  available Cash{" | "}Sell Alloc:{" "}
                  <strong>{activePreset.allocSellPct}%</strong> of total BTC
                </div>
              </div>
            </div>
          ) : (
            <div className="brutal-info-strip border-l-4 border-l-[#547792] text-xs leading-relaxed">
              <div className="font-display font-bold text-[#213448]">
                Custom Manual Configuration
              </div>
              <p className="mt-1 text-[#547792]">
                Adjust any threshold, allocation, date range, or fee below —
                metrics and charts update instantaneously.
              </p>
            </div>
          )}

          {/* Threshold Sliders */}
          <div className="space-y-4 border-t-2 border-[#ede8e0] pt-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="buy-threshold-slider"
                  className="font-display text-sm font-bold text-[#213448]"
                >
                  Buy Threshold
                </label>
                <span className="border-2 border-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 font-label text-xs font-bold text-[#16a34a]">
                  &le; {thresholdBuy}%
                </span>
              </div>
              <input
                id="buy-threshold-slider"
                type="range"
                min={1}
                max={99}
                step={1}
                value={thresholdBuy}
                onChange={(e) => {
                  setPresetId("custom");
                  setThresholdBuy(Number(e.target.value));
                }}
                className="w-full accent-[#16a34a]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="sell-threshold-slider"
                  className="font-display text-sm font-bold text-[#213448]"
                >
                  Sell Threshold
                </label>
                <span className="border-2 border-[#dc2626] bg-[#dc2626]/10 px-2 py-0.5 font-label text-xs font-bold text-[#dc2626]">
                  &ge; {thresholdSell}%
                </span>
              </div>
              <input
                id="sell-threshold-slider"
                type="range"
                min={2}
                max={100}
                step={1}
                value={thresholdSell}
                onChange={(e) => {
                  setPresetId("custom");
                  setThresholdSell(Number(e.target.value));
                }}
                className="w-full accent-[#dc2626]"
              />
            </div>

            {/* Visual Rainbow Buy / Hold / Sell Zone Bar */}
            <div className="border-2 border-[#c9c2b8] bg-white p-3 shadow-[4px_4px_0px_0px_rgba(33,52,72,0.1)]">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="text-[#16a34a]">
                  Buy Zone (&le;{thresholdBuy})
                </span>
                <span className="text-center text-[#547792]">
                  Hold Zone ({holdPct} pts)
                </span>
                <span className="flex items-center gap-1.5 text-[#dc2626]">
                  <span>Sell Zone (&ge;{thresholdSell})</span>
                  <Tooltip content="Visual representation of the Buy, Hold, and Sell zones based on your selected thresholds." />
                </span>
              </div>
              <div className="flex h-4 w-full overflow-hidden border border-[#213448]/20">
                <div
                  style={{
                    width: `${buyBarWidth}%`,
                    background: "linear-gradient(90deg, #22c55e, #16a34a)",
                  }}
                />
                <div
                  className="flex items-center justify-center bg-[#f1f5f9]"
                  style={{ width: `${holdBarWidth}%` }}
                >
                  <div
                    className="h-[2px] w-full"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, transparent, transparent 4px, #cbd5e1 4px, #cbd5e1 8px)",
                    }}
                  />
                </div>
                <div
                  style={{
                    width: `${sellBarWidth}%`,
                    background: "linear-gradient(90deg, #ef4444, #dc2626)",
                  }}
                />
              </div>
            </div>

            {/* Allocation Sliders */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="buy-alloc-slider"
                    className="font-label text-xs font-bold uppercase text-[#547792]"
                  >
                    Buy Alloc %
                  </label>
                  <span className="font-display text-sm font-bold text-[#213448]">
                    {allocBuy}%
                  </span>
                </div>
                <input
                  id="buy-alloc-slider"
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={allocBuy}
                  onChange={(e) => {
                    setPresetId("custom");
                    setAllocBuy(Number(e.target.value));
                  }}
                  className="w-full accent-[#0a7c6e]"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="sell-alloc-slider"
                    className="font-label text-xs font-bold uppercase text-[#547792]"
                  >
                    Sell Alloc %
                  </label>
                  <span className="font-display text-sm font-bold text-[#213448]">
                    {allocSell}%
                  </span>
                </div>
                <input
                  id="sell-alloc-slider"
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={allocSell}
                  onChange={(e) => {
                    setPresetId("custom");
                    setAllocSell(Number(e.target.value));
                  }}
                  className="w-full accent-[#0a7c6e]"
                />
              </div>
            </div>
          </div>

          {/* Simulation Period & Capital */}
          <div className="space-y-4 border-t-2 border-[#ede8e0] pt-4">
            <div>
              <div className="metric-label mb-2">Simulation Period</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="sim-start-date"
                    className="mb-1 block font-label text-xs font-semibold text-[#547792]"
                  >
                    From
                  </label>
                  <input
                    id="sim-start-date"
                    type="date"
                    value={startDate}
                    min={dataMin}
                    max={dataMax}
                    onChange={(e) => {
                      if (e.target.value) setStartDate(e.target.value);
                    }}
                    className="w-full border-2 border-[#c9c2b8] bg-white px-2.5 py-1.5 font-body text-sm text-[#213448] focus:border-[#0a7c6e] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="sim-end-date"
                    className="mb-1 block font-label text-xs font-semibold text-[#547792]"
                  >
                    To
                  </label>
                  <input
                    id="sim-end-date"
                    type="date"
                    value={endDate}
                    min={dataMin}
                    max={dataMax}
                    onChange={(e) => {
                      setEndDateOverride(e.target.value || null);
                    }}
                    className="w-full border-2 border-[#c9c2b8] bg-white px-2.5 py-1.5 font-body text-sm text-[#213448] focus:border-[#0a7c6e] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="sim-initial-cash"
                className="metric-label block"
              >
                Initial Capital (USD)
              </label>
              <input
                id="sim-initial-cash"
                type="number"
                min={1}
                max={10_000_000}
                step={1000}
                value={initialCash}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (Number.isFinite(val)) {
                    setInitialCash(val);
                  }
                }}
                className="w-full border-2 border-[#c9c2b8] bg-white px-3 py-2 font-display text-sm font-bold text-[#213448] focus:border-[#0a7c6e] focus:outline-none"
              />
            </div>

            {/* Expandable Advanced Settings */}
            <div className="border-2 border-[#c9c2b8] bg-[#fff8f1]">
              <button
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((prev) => !prev)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 font-display text-sm font-bold text-[#213448] hover:text-[#0a7c6e]"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span>Advanced Settings</span>
                </span>
                {advancedOpen ? (
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
              </button>

              {advancedOpen && (
                <div className="border-t-2 border-[#d4cdc4] bg-white px-3.5 py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="trading-fee-slider"
                      className="font-label text-xs font-bold uppercase text-[#547792]"
                    >
                      Trading Fee %
                    </label>
                    <span className="font-display text-sm font-bold text-[#213448]">
                      {feePct.toFixed(2)}%
                    </span>
                  </div>
                  <input
                    id="trading-fee-slider"
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.05}
                    value={feePct}
                    onChange={(e) => setFeePct(Number(e.target.value))}
                    className="w-full accent-[#0a7c6e]"
                  />
                  <p className="mt-1 font-body text-xs text-[#547792]">
                    Per-transaction fee. Binance Spot = 0.10%. Coinbase = 0.20%.
                    0.00% = no fees.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Validation & Short-Period Banners */}
          {validationError && (
            <div
              role="alert"
              className="flex items-start gap-2 border-2 border-[#dc2626] bg-[#fff5f5] p-3 font-body text-sm font-medium text-[#991b1b]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          {!validationError && periodDays > 0 && periodDays < 365 && (
            <div className="brutal-warn-badge w-full">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Period is less than 1 year — results may not be meaningful.
              </span>
            </div>
          )}
        </section>

        {/* ══ RIGHT: LIVE RESULTS PANEL ══ */}
        <section
          aria-label="Simulation results"
          className="space-y-5 lg:col-span-7"
        >
          {!simResult ? (
            <div className="brutal-card-static flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
              <AlertCircle
                className="h-10 w-10 text-[#dc2626]"
                aria-hidden="true"
              />
              <h2 className="mt-3 font-display text-lg font-bold text-[#213448]">
                Adjust Parameters to Run Simulation
              </h2>
              <p className="mt-1 max-w-md font-body text-sm text-[#547792]">
                {validationError ??
                  engineError ??
                  "Ensure Buy Threshold is below Sell Threshold and at least 30 trading days are selected."}
              </p>
            </div>
          ) : (
            <ResultsPanel
              simResult={simResult}
              slicedDataset={slicedDataset}
              thresholdBuy={thresholdBuy}
              thresholdSell={thresholdSell}
              periodDays={periodDays}
            />
          )}
        </section>
      </div>

      {/* ── Full-Width Transaction History ── */}
      {simResult && (
        <section aria-labelledby="tx-history-heading" className="space-y-4">
          <hr className="brutal-divider" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="tx-history-heading"
                className="font-display text-xl font-bold text-[#213448]"
              >
                Transaction History
              </h2>
              <p className="mt-1 font-body text-sm text-[#547792]">
                <strong>{simResult.tradeLog.length} transactions</strong> found
                during the simulation period &middot;{" "}
                {formatDisplayDate(startDate)} &ndash;{" "}
                {formatDisplayDate(endDate)}
              </p>
            </div>

            {simResult.tradeLog.length > 0 && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="brutal-btn-primary text-sm"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Export Transaction History (CSV)</span>
              </button>
            )}
          </div>

          {simResult.tradeLog.length === 0 ? (
            <div className="brutal-card-static p-6 font-body text-sm text-[#547792]">
              No transactions were executed with these parameters.
            </div>
          ) : (
            <>
              {/* Filter Pills + Row Count Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="group"
                  aria-label="Filter transactions by action"
                  className="flex flex-wrap items-center gap-2"
                >
                  {(
                    [
                      {
                        key: "ALL" as const,
                        label: `All (${simResult.tradeLog.length})`,
                      },
                      {
                        key: "BUY" as const,
                        label: `BUY (${simResult.metrics.buyCount})`,
                      },
                      {
                        key: "SELL" as const,
                        label: `SELL (${simResult.metrics.sellCount})`,
                      },
                    ] as const
                  ).map(({ key, label }) => {
                    const active = actionFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setActionFilter(key)}
                        className={[
                          "border-2 px-3 py-1 font-label text-xs font-bold uppercase transition-colors",
                          active
                            ? "border-[#213448] bg-[#213448] text-white"
                            : "border-[#c9c2b8] bg-white text-[#213448] hover:border-[#0a7c6e] hover:text-[#0a7c6e]",
                        ].join(" ")}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="tx-row-limit"
                    className="font-label text-xs font-semibold uppercase text-[#547792]"
                  >
                    Rows
                  </label>
                  <select
                    id="tx-row-limit"
                    value={rowLimit}
                    onChange={(e) =>
                      setRowLimit(e.target.value as RowLimitOption)
                    }
                    className="border-2 border-[#c9c2b8] bg-white px-2.5 py-1 font-label text-xs font-semibold text-[#213448] focus:border-[#0a7c6e] focus:outline-none"
                  >
                    <option value="50">Last 50</option>
                    <option value="100">Last 100</option>
                    <option value="250">Last 250</option>
                    <option value="ALL">All ({filteredTrades.length})</option>
                  </select>
                </div>
              </div>

              {/* Neo-Brutalist Transaction Table */}
              <div className="brutal-table-wrap max-h-[440px] overflow-y-auto">
                <table className="w-full border-collapse text-left font-body text-sm">
                  <thead className="sticky top-0 z-10 border-b-2 border-[#c9c2b8] bg-[#ede8e0] font-label text-[11px] font-bold uppercase tracking-wider text-[#213448]">
                    <tr>
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Action</th>
                      <th className="px-3 py-2.5 text-right">BTC Price</th>
                      <th className="px-3 py-2.5 text-right">Amount (USD)</th>
                      <th className="px-3 py-2.5 text-right">Amount (BTC)</th>
                      <th className="px-3 py-2.5 text-right">Index</th>
                      <th className="px-3 py-2.5 text-right">Cash After</th>
                      <th className="px-3 py-2.5 text-right">BTC After</th>
                      <th className="px-3 py-2.5 text-right">Equity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d4cdc4]">
                    {visibleTrades.length === 0 ? (
                      <tr>
                        <td
                          colSpan={10}
                          className="px-4 py-6 text-center text-[#547792]"
                        >
                          No {actionFilter} transactions in this period.
                        </td>
                      </tr>
                    ) : (
                      visibleTrades.map((row) => {
                        const isBuy = row.action === "BUY";
                        return (
                          <tr
                            key={`${row.tradeNumber}-${row.date}-${row.action}`}
                            className={
                              isBuy
                                ? "bg-[#22c55e]/[0.10] hover:bg-[#22c55e]/[0.16]"
                                : "bg-[#ef4444]/[0.10] hover:bg-[#ef4444]/[0.16]"
                            }
                          >
                            <td className="px-3 py-2 font-label text-xs font-semibold text-[#547792]">
                              {row.tradeNumber}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-label text-xs font-medium text-[#213448]">
                              {row.date}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={[
                                  "inline-block border px-2 py-0.5 font-label text-[11px] font-bold uppercase",
                                  isBuy
                                    ? "border-[#16a34a] bg-white text-[#16a34a]"
                                    : "border-[#dc2626] bg-white text-[#dc2626]",
                                ].join(" ")}
                              >
                                {row.action}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-[#213448]">
                              {formatCurrency(row.btcPrice)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-[#213448]">
                              {formatCurrency(row.amountUsd)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-[#213448]">
                              {row.btcAmount.toFixed(6)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-label text-xs font-semibold text-[#0369a1]">
                              {row.signalIndex.toFixed(1)}%
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-[#213448]">
                              {formatCurrency(row.cashAfter)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-[#213448]">
                              {row.btcHeldAfter.toFixed(6)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-bold text-[#213448]">
                              {formatCurrency(row.equityAfter)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function ResultsPanel({
  simResult,
  slicedDataset,
  thresholdBuy,
  thresholdSell,
  periodDays,
}: {
  simResult: SimulationResult;
  slicedDataset: ColumnarDataset;
  thresholdBuy: number;
  thresholdSell: number;
  periodDays: number;
}) {
  const { metrics: m, benchmarkMetrics: bm } = simResult;
  const diffUsd = m.finalPortfolioValue - bm.finalValue;
  const outperforms = diffUsd >= 0;
  const diffColor = outperforms ? "#0a7c6e" : "#dc2626";
  const diffDisplay = `${outperforms ? "+" : "-"}${formatCurrency(Math.abs(diffUsd))}`;
  const periodYrs = Math.max(1, periodDays) / 365;

  return (
    <div className="space-y-4">
      {simResult.lowSampleWarning && (
        <div className="brutal-warn-badge">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Low trade count (&lt; 10) — statistical metrics may not be reliable
          </span>
        </div>
      )}

      {/* Row 1: Hero Cards — Final Portfolio vs HODL */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          className="brutal-card-static p-5"
          style={{ borderLeft: "4px solid #0a7c6e" }}
        >
          <div className="metric-label">Final Portfolio</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#213448]">
            {formatCurrency(m.finalPortfolioValue)}
          </div>
          <div className="mt-1 font-display text-base font-bold text-[#0a7c6e]">
            {formatPercentage(m.totalReturn * 100)}
          </div>
        </div>

        <div
          className="brutal-card-static p-5"
          style={{ borderLeft: "4px solid #0369a1" }}
        >
          <div className="metric-label">HODL Comparison</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#213448]">
            {formatCurrency(bm.finalValue)}
          </div>
          <div className="mt-1 font-display text-base font-bold text-[#0369a1]">
            {formatPercentage(bm.totalReturn * 100)}
          </div>
        </div>
      </div>

      {/* Row 2: Core Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="brutal-card-static p-4">
          <div className="metric-label">MAX DRAWDOWN</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#213448]">
            {formatPercentage(-m.maxDrawdown * 100)}
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 bg-[#ede8e0] px-2 py-0.5 font-label text-xs font-medium text-[#547792]">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              <span>{m.maxDrawdownDate || "N/A"}</span>
            </span>
          </div>
        </div>

        <div className="brutal-card-static p-4">
          <div className="metric-label">SHARPE RATIO</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#213448]">
            {m.sharpeRatio.toFixed(2)}
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 bg-[#ede8e0] px-2 py-0.5 font-label text-xs font-medium text-[#547792]">
              <Scale className="h-3 w-3" aria-hidden="true" />
              <span>B&amp;H: {bm.sharpeRatio.toFixed(2)}</span>
            </span>
          </div>
        </div>

        <div className="brutal-card-static p-4">
          <div className="metric-label">TOTAL TRADES &amp; WIN RATE</div>
          <div className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#213448]">
            {m.tradeCount}{" "}
            <span className="text-base font-semibold text-[#547792]">
              ({(m.winRate * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="mt-2">
            <span className="inline-flex items-center gap-2 bg-[#ede8e0] px-2 py-0.5 font-label text-xs font-medium text-[#547792]">
              <span className="text-[#16a34a]">{m.buyCount} Buys</span>
              <span>&middot;</span>
              <span className="text-[#dc2626]">{m.sellCount} Sells</span>
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Remaining Assets + Strategy vs HODL */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="brutal-card-static p-5">
          <div className="metric-label">REMAINING ASSETS (CASH &amp; BTC)</div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <div className="font-display text-xl font-extrabold tracking-tight text-[#213448]">
                {formatCurrency(m.finalCash)}
              </div>
              <div className="font-label text-xs font-semibold text-[#547792]">
                Cash
              </div>
            </div>
            <div className="h-10 w-[2px] bg-[#d4cdc4]" />
            <div className="text-right">
              <div className="font-display text-xl font-extrabold tracking-tight text-[#213448]">
                {formatNumber(m.finalBtc)}
              </div>
              <div className="font-label text-xs font-semibold text-[#547792]">
                BTC
              </div>
            </div>
          </div>
        </div>

        <div
          className="brutal-card-static p-5"
          style={{ borderLeft: `4px solid ${diffColor}` }}
        >
          <div className="metric-label">STRATEGY VS HODL</div>
          <div
            className="mt-1 font-display text-2xl font-extrabold tracking-tight"
            style={{ color: diffColor }}
          >
            {diffDisplay}
          </div>
          <div
            className="mt-1.5 flex items-center gap-1.5 font-label text-xs font-bold"
            style={{ color: diffColor }}
          >
            {outperforms ? (
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              {outperforms
                ? "Strategy outperforms"
                : "Strategy underperforms"}
            </span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="brutal-card-static p-3 sm:p-4">
        <EquityCurveChart result={simResult} />
      </div>

      <div className="brutal-card-static p-3 sm:p-4">
        <SignalIndexChart
          dataset={slicedDataset}
          thresholdBuy={thresholdBuy}
          thresholdSell={thresholdSell}
          tradeLog={simResult.tradeLog}
        />
      </div>

      {/* Auto-Generated Summary Callout */}
      <div className="brutal-info-strip leading-relaxed">
        <strong>Summary:</strong> With a Buy Threshold of{" "}
        <strong>{simResult.params.thresholdBuy}</strong> and Sell Threshold of{" "}
        <strong>{simResult.params.thresholdSell}</strong>, the strategy
        generated a{" "}
        <strong>
          {formatPercentage(m.totalReturn * 100)} total return
        </strong>{" "}
        over {periodYrs.toFixed(1)} years, compared to{" "}
        <strong>{formatPercentage(bm.totalReturn * 100)}</strong> with HODL.
        Total <strong>{m.tradeCount} trades</strong> ({m.buyCount} buys &middot;{" "}
        {m.sellCount} sells) with a win rate of{" "}
        <strong>{(m.winRate * 100).toFixed(1)}%</strong>. Final portfolio:{" "}
        <strong>{formatCurrency(m.finalPortfolioValue)}</strong> vs HODL{" "}
        <strong>{formatCurrency(bm.finalValue)}</strong> &mdash;{" "}
        {outperforms ? "Strategy outperforms" : "Strategy underperforms"}.
      </div>
    </div>
  );
}
