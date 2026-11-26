import * as echarts from "echarts/core";
import {
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { formatCompactDollar, formatCurrency } from "@/lib/format";
import type { TradeRow } from "@/lib/types";

echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  HeatmapChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsCoreOption, EChartsType };

export const CHART_COLORS = {
  strategy: "#0a7c6e",
  benchmark: "#d97706",
  buyMarker: "#16a34a",
  sellMarker: "#dc2626",
  buyZoneFill: "rgba(22, 163, 74, 0.09)",
  sellZoneFill: "rgba(220, 38, 38, 0.08)",
  signalLine: "#0369a1",
  secondaryScenario: "#7c3aed",
  sharpeBar: "#f87171",
  text: "#213448",
  textMuted: "rgba(33, 52, 72, 0.55)",
  grid: "rgba(33, 52, 72, 0.08)",
  axisLine: "rgba(33, 52, 72, 0.22)",
  tooltipBg: "rgba(255, 255, 255, 0.96)",
  tooltipBorder: "#c9c2b8",
} as const;

export const CHART_FONT = "Space Grotesk, Inter, Work Sans, sans-serif";

export const BASE_TOOLTIP_STYLE = {
  backgroundColor: CHART_COLORS.tooltipBg,
  borderColor: CHART_COLORS.tooltipBorder,
  borderWidth: 1,
  borderRadius: 0,
  padding: [8, 12],
  textStyle: {
    color: CHART_COLORS.text,
    fontFamily: CHART_FONT,
    fontSize: 12,
  },
} as const;

export const BASE_LEGEND_STYLE = {
  top: 6,
  left: 8,
  itemWidth: 16,
  itemHeight: 10,
  textStyle: {
    color: CHART_COLORS.text,
    fontFamily: CHART_FONT,
    fontSize: 11,
  },
} as const;

export const DATA_ZOOM_CONTROLS = [
  {
    type: "inside",
    xAxisIndex: 0,
    filterMode: "none",
  },
  {
    type: "slider",
    xAxisIndex: 0,
    filterMode: "none",
    height: 22,
    bottom: 8,
    borderColor: CHART_COLORS.tooltipBorder,
    backgroundColor: "rgba(237, 232, 224, 0.5)",
    fillerColor: "rgba(10, 124, 110, 0.14)",
    handleStyle: {
      color: CHART_COLORS.strategy,
      borderColor: CHART_COLORS.text,
    },
    textStyle: {
      color: CHART_COLORS.text,
      fontFamily: CHART_FONT,
      fontSize: 10,
    },
  },
] as const;

export interface TooltipParamLike {
  seriesName?: string;
  marker?: string;
  axisValue?: string | number;
  name?: string;
  value?: unknown;
  data?: unknown;
}

export function asTooltipItems(params: unknown): TooltipParamLike[] {
  if (Array.isArray(params)) {
    return params.filter(
      (item): item is TooltipParamLike =>
        typeof item === "object" && item !== null
    );
  }
  if (typeof params === "object" && params !== null) {
    return [params as TooltipParamLike];
  }
  return [];
}

export function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatUtcDate(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  return "";
}

export function createTimeXAxis(): Record<string, unknown> {
  return {
    type: "time",
    boundaryGap: false,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: {
      show: true,
      lineStyle: { color: CHART_COLORS.grid, width: 1 },
    },
    axisLabel: {
      color: CHART_COLORS.text,
      fontFamily: CHART_FONT,
      fontSize: 11,
    },
  };
}

export function createLogDollarYAxis(
  values: number[],
  axisTitle?: string
): Record<string, unknown> {
  const positives = values.filter((v) => Number.isFinite(v) && v > 0);
  const minVal = positives.length > 0 ? Math.min(...positives) : 100;
  const maxVal = positives.length > 0 ? Math.max(...positives) : 1_000_000;
  const snappedMin = Math.pow(10, Math.floor(Math.log10(minVal)));
  const snappedMax = Math.pow(10, Math.ceil(Math.log10(maxVal)));

  return {
    type: "log",
    logBase: 10,
    min: snappedMin,
    max: snappedMax > snappedMin ? snappedMax : snappedMin * 10,
    name: axisTitle,
    nameLocation: axisTitle ? "middle" : undefined,
    nameGap: axisTitle ? 54 : undefined,
    nameTextStyle: {
      color: CHART_COLORS.text,
      fontFamily: CHART_FONT,
      fontSize: 11,
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: {
      show: true,
      lineStyle: { color: CHART_COLORS.grid, width: 1 },
    },
    axisLabel: {
      color: CHART_COLORS.text,
      fontFamily: CHART_FONT,
      fontSize: 11,
      formatter: (val: number) => formatCompactDollar(val),
    },
  };
}

export interface SplitTradeMarkers {
  firstBuys: TradeRow[];
  firstSells: TradeRow[];
  restBuys: TradeRow[];
  restSells: TradeRow[];
}

export function splitTradeMarkers(tradeLog: TradeRow[]): SplitTradeMarkers {
  const firstBuys: TradeRow[] = [];
  const firstSells: TradeRow[] = [];
  const restBuys: TradeRow[] = [];
  const restSells: TradeRow[] = [];

  let prevAction: TradeRow["action"] | null = null;
  for (const trade of tradeLog) {
    const isTransition = trade.action !== prevAction;
    if (trade.action === "BUY") {
      (isTransition ? firstBuys : restBuys).push(trade);
    } else {
      (isTransition ? firstSells : restSells).push(trade);
    }
    prevAction = trade.action;
  }

  return { firstBuys, firstSells, restBuys, restSells };
}

/**
 * Binary search for the nearest ascending ISO date index.
 */
export function findNearestIndex(
  sortedDates: string[],
  targetDate: string
): number {
  const n = sortedDates.length;
  if (n === 0) return -1;
  if (n === 1) return 0;

  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midVal = sortedDates[mid] ?? "";
    if (midVal < targetDate) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  if (lo === 0) return 0;
  const prevDate = sortedDates[lo - 1] ?? "";
  const currDate = sortedDates[lo] ?? "";
  const targetMs = Date.parse(targetDate);
  const prevDiff = Math.abs(targetMs - Date.parse(prevDate));
  const currDiff = Math.abs(Date.parse(currDate) - targetMs);
  return prevDiff <= currDiff ? lo - 1 : lo;
}

export interface TradeMarkerDatum {
  value: [string, number, number, number, string];
}

export function buildTradeMarkerSeries(
  tradeLog: TradeRow[],
  targetDates: string[],
  getYValue: (index: number) => number | null
): Record<string, unknown>[] {
  if (tradeLog.length === 0 || targetDates.length === 0) {
    return [];
  }

  const { firstBuys, firstSells, restBuys, restSells } =
    splitTradeMarkers(tradeLog);

  const mapTrades = (trades: TradeRow[]): TradeMarkerDatum[] => {
    const points: TradeMarkerDatum[] = [];
    for (const trade of trades) {
      const idx = findNearestIndex(targetDates, trade.date);
      if (idx < 0) continue;
      const y = getYValue(idx);
      const xDate = targetDates[idx];
      if (y === null || !Number.isFinite(y) || !xDate) continue;
      points.push({
        value: [xDate, y, trade.btcPrice, trade.amountUsd, trade.date],
      });
    }
    return points;
  };

  const groups: Array<{
    name: string;
    trades: TradeRow[];
    symbol: string;
    symbolRotate?: number;
    symbolSize: number;
    color: string;
    z: number;
  }> = [
    {
      name: "Buy Signal",
      trades: firstBuys,
      symbol: "triangle",
      symbolSize: 11,
      color: CHART_COLORS.buyMarker,
      z: 6,
    },
    {
      name: "Sell Signal",
      trades: firstSells,
      symbol: "triangle",
      symbolRotate: 180,
      symbolSize: 11,
      color: CHART_COLORS.sellMarker,
      z: 6,
    },
    {
      name: "Subsequent Buys",
      trades: restBuys,
      symbol: "circle",
      symbolSize: 6,
      color: CHART_COLORS.buyMarker,
      z: 5,
    },
    {
      name: "Subsequent Sells",
      trades: restSells,
      symbol: "circle",
      symbolSize: 6,
      color: CHART_COLORS.sellMarker,
      z: 5,
    },
  ];

  const series: Record<string, unknown>[] = [];
  for (const group of groups) {
    const data = mapTrades(group.trades);
    if (data.length === 0) continue;
    const isBuy = group.color === CHART_COLORS.buyMarker;
    series.push({
      name: group.name,
      type: "scatter",
      data,
      symbol: group.symbol,
      symbolRotate: group.symbolRotate ?? 0,
      symbolSize: group.symbolSize,
      itemStyle: {
        color: group.color,
        opacity: 0.88,
      },
      z: group.z,
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const item = asTooltipItems(raw)[0];
          const tuple = Array.isArray(item?.value) ? item.value : [];
          const btcPrice = Number(tuple[2]);
          const amountUsd = Number(tuple[3]);
          const execDate = formatUtcDate(tuple[4] ?? tuple[0]);
          const actionLabel = isBuy ? "Buy" : "Sell";
          return (
            `<div style="font-weight:700;margin-bottom:2px;">${escapeHtml(execDate)}</div>` +
            `<span style="color:${group.color};font-weight:700;">${actionLabel}</span>: ` +
            `<b>${escapeHtml(formatCurrency(amountUsd))}</b> @ ` +
            `<b>${escapeHtml(formatCurrency(btcPrice))}</b>`
          );
        },
      },
    });
  }

  return series;
}

export function computePercentile(
  sortedAsc: number[],
  percentile: number
): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0] ?? 0;

  const rank = (percentile / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const loVal = sortedAsc[lo] ?? 0;
  const hiVal = sortedAsc[hi] ?? loVal;
  return loVal + (hiVal - loVal) * (rank - lo);
}

export function emptyChartOption(
  titleText: string,
  emptyMessage = "No chart data available."
): EChartsCoreOption {
  return {
    backgroundColor: "transparent",
    title: titleText
      ? {
          text: titleText,
          left: 8,
          top: 6,
          textStyle: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 14,
            fontWeight: 700,
          },
        }
      : undefined,
    graphic: [
      {
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: emptyMessage,
          fill: CHART_COLORS.textMuted,
          fontFamily: CHART_FONT,
          fontSize: 13,
        },
      },
    ],
  };
}
