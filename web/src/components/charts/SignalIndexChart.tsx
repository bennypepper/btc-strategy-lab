"use client";

import { useMemo } from "react";
import { EChartCanvas } from "@/components/EChartCanvas";
import {
  asTooltipItems,
  BASE_LEGEND_STYLE,
  BASE_TOOLTIP_STYLE,
  buildTradeMarkerSeries,
  CHART_COLORS,
  CHART_FONT,
  createTimeXAxis,
  emptyChartOption,
  escapeHtml,
  formatUtcDate,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import type { ColumnarDataset, TradeRow } from "@/lib/types";

export interface SignalIndexChartProps {
  dataset: ColumnarDataset;
  thresholdBuy: number;
  thresholdSell: number;
  tradeLog: TradeRow[];
  height?: number;
}

export function SignalIndexChart({
  dataset,
  thresholdBuy,
  thresholdSell,
  tradeLog,
  height = 340,
}: SignalIndexChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const validDates: string[] = [];
    const validSignals: number[] = [];
    const signalPoints: Array<[string, number]> = [];

    const len = Math.min(dataset.dates.length, dataset.trolololo.length);
    for (let i = 0; i < len; i += 1) {
      const date = dataset.dates[i];
      const sig = dataset.trolololo[i];
      if (date && sig !== null && sig !== undefined && Number.isFinite(sig)) {
        validDates.push(date);
        validSignals.push(sig);
        signalPoints.push([date, sig]);
      }
    }

    if (signalPoints.length === 0) {
      return emptyChartOption(
        `Regression Index with Signals — Buy ≤ ${thresholdBuy} | Sell ≥ ${thresholdSell}`,
        "No valid Regression Index values available."
      );
    }

    const markerSeries = buildTradeMarkerSeries(
      tradeLog,
      validDates,
      (idx) => validSignals[idx] ?? null
    );

    return {
      backgroundColor: "transparent",
      useUTC: true,
      animation: false,
      title: {
        text: `Regression Index with Signals  —  Buy ≤ ${thresholdBuy}  |  Sell ≥ ${thresholdSell}`,
        left: 8,
        top: 4,
        textStyle: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 14,
          fontWeight: 700,
        },
      },
      legend: {
        ...BASE_LEGEND_STYLE,
        top: 32,
        data: ["Regression Index", "Buy Signal", "Sell Signal"],
      },
      grid: {
        left: 64,
        right: 24,
        top: 68,
        bottom: 36,
      },
      tooltip: {
        ...BASE_TOOLTIP_STYLE,
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: { color: CHART_COLORS.axisLine, width: 1 },
        },
        formatter: (raw: unknown) => {
          const items = asTooltipItems(raw).filter(
            (item) => item.seriesName === "Regression Index"
          );
          if (items.length === 0) return "";
          const item = items[0]!;
          const dateStr = formatUtcDate(
            Array.isArray(item.value) ? item.value[0] : item.axisValue
          );
          const val = Array.isArray(item.value)
            ? Number(item.value[1])
            : Number(item.value);
          const formatted = Number.isFinite(val) ? `${val.toFixed(1)}%` : "N/A";
          return (
            `<div style="font-weight:700;margin-bottom:4px;">${escapeHtml(
              dateStr
            )}</div>` +
            `<div>${item.marker ?? ""}Regression Index: <b>${escapeHtml(
              formatted
            )}</b></div>`
          );
        },
      },
      xAxis: createTimeXAxis(),
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        interval: 20,
        name: "Regression Index (0–100)",
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
        },
      },
      series: [
        {
          name: "Regression Index",
          type: "line",
          data: signalPoints,
          smooth: 0.35,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.signalLine,
            width: 1.6,
          },
          itemStyle: { color: CHART_COLORS.signalLine },
          markArea: {
            silent: true,
            data: [
              [
                {
                  yAxis: 0,
                  itemStyle: { color: CHART_COLORS.buyZoneFill },
                },
                { yAxis: thresholdBuy },
              ],
              [
                {
                  yAxis: thresholdSell,
                  itemStyle: { color: CHART_COLORS.sellZoneFill },
                },
                { yAxis: 100 },
              ],
            ],
          },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            data: [
              {
                yAxis: thresholdBuy,
                lineStyle: {
                  color: CHART_COLORS.buyMarker,
                  width: 1.5,
                  type: "dashed",
                },
                label: {
                  formatter: `Buy ≤ ${thresholdBuy}`,
                  position: "insideStartTop",
                  color: CHART_COLORS.buyMarker,
                  fontFamily: CHART_FONT,
                  fontSize: 11,
                  fontWeight: 600,
                },
              },
              {
                yAxis: thresholdSell,
                lineStyle: {
                  color: CHART_COLORS.sellMarker,
                  width: 1.5,
                  type: "dashed",
                },
                label: {
                  formatter: `Sell ≥ ${thresholdSell}`,
                  position: thresholdSell > 90 ? "insideStartBottom" : "insideStartTop",
                  color: CHART_COLORS.sellMarker,
                  fontFamily: CHART_FONT,
                  fontSize: 11,
                  fontWeight: 600,
                },
              },
            ],
          },
        },
        ...markerSeries,
      ],
    };
  }, [dataset, thresholdBuy, thresholdSell, tradeLog]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel="Regression Index signal chart with buy and sell threshold zones"
    />
  );
}
