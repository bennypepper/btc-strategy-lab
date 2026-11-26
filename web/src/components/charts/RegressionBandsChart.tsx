"use client";

import { useMemo } from "react";
import { EChartCanvas } from "@/components/EChartCanvas";
import {
  asTooltipItems,
  BASE_LEGEND_STYLE,
  BASE_TOOLTIP_STYLE,
  CHART_COLORS,
  createLogDollarYAxis,
  createTimeXAxis,
  DATA_ZOOM_CONTROLS,
  emptyChartOption,
  escapeHtml,
  formatUtcDate,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import { formatCurrency } from "@/lib/format";
import { computeTrolololoBands } from "@/lib/trolololo";
import type { ColumnarDataset } from "@/lib/types";

export interface RegressionBandsChartProps {
  dataset: ColumnarDataset;
  height?: number;
}

export function RegressionBandsChart({
  dataset,
  height = 430,
}: RegressionBandsChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const validDates: string[] = [];
    const validPrices: number[] = [];

    const len = Math.min(dataset.dates.length, dataset.btc_close.length);
    for (let i = 0; i < len; i += 1) {
      const d = dataset.dates[i];
      const p = dataset.btc_close[i];
      if (d && p !== undefined && Number.isFinite(p) && p > 0) {
        validDates.push(d);
        validPrices.push(p);
      }
    }

    if (validDates.length === 0) {
      return emptyChartOption(
        "Logarithmic Regression Bands",
        "No valid BTC price data available."
      );
    }

    const { topBand, bottomBand } = computeTrolololoBands(
      validDates,
      validPrices
    );

    const bottomPoints: Array<[string, number]> = [];
    const topPoints: Array<[string, number]> = [];
    const pricePoints: Array<[string, number]> = [];
    const allPositives: number[] = [];

    for (let i = 0; i < validDates.length; i += 1) {
      const date = validDates[i]!;
      const price = validPrices[i]!;
      pricePoints.push([date, price]);
      allPositives.push(price);

      const b = bottomBand[i];
      if (b !== null && b !== undefined && Number.isFinite(b) && b > 0) {
        bottomPoints.push([date, b]);
        allPositives.push(b);
      }

      const t = topBand[i];
      if (t !== null && t !== undefined && Number.isFinite(t) && t > 0) {
        topPoints.push([date, t]);
        allPositives.push(t);
      }
    }

    return {
      backgroundColor: "transparent",
      useUTC: true,
      animation: false,
      grid: {
        left: 64,
        right: 24,
        top: 48,
        bottom: 64,
      },
      legend: {
        ...BASE_LEGEND_STYLE,
        data: ["Bottom Band", "Top Band", "BTC Price"],
      },
      tooltip: {
        ...BASE_TOOLTIP_STYLE,
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: { color: CHART_COLORS.axisLine, width: 1 },
        },
        formatter: (raw: unknown) => {
          const items = asTooltipItems(raw);
          if (items.length === 0) return "";
          const firstVal = Array.isArray(items[0]?.value)
            ? items[0].value[0]
            : items[0]?.axisValue;
          const dateStr = formatUtcDate(firstVal);
          const rows = items
            .map((item) => {
              const val = Array.isArray(item.value)
                ? Number(item.value[1])
                : Number(item.value);
              const formatted = Number.isFinite(val)
                ? formatCurrency(val)
                : "N/A";
              return `<div>${item.marker ?? ""}${escapeHtml(
                item.seriesName ?? ""
              )}: <b>${escapeHtml(formatted)}</b></div>`;
            })
            .join("");
          return `<div style="font-weight:700;margin-bottom:4px;">${escapeHtml(
            dateStr
          )}</div>${rows}`;
        },
      },
      xAxis: createTimeXAxis(),
      yAxis: createLogDollarYAxis(allPositives),
      dataZoom: DATA_ZOOM_CONTROLS,
      series: [
        {
          name: "Bottom Band",
          type: "line",
          data: bottomPoints,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.buyMarker,
            width: 1.5,
            type: "dashed",
          },
          itemStyle: { color: CHART_COLORS.buyMarker },
        },
        {
          name: "Top Band",
          type: "line",
          data: topPoints,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.sellMarker,
            width: 1.5,
            type: "dashed",
          },
          itemStyle: { color: CHART_COLORS.sellMarker },
        },
        {
          name: "BTC Price",
          type: "line",
          data: pricePoints,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.benchmark,
            width: 1.8,
          },
          itemStyle: { color: CHART_COLORS.benchmark },
        },
      ],
    };
  }, [dataset]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel="Logarithmic regression price bands chart"
    />
  );
}
