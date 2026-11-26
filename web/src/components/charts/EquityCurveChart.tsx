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
  createLogDollarYAxis,
  createTimeXAxis,
  DATA_ZOOM_CONTROLS,
  emptyChartOption,
  escapeHtml,
  formatUtcDate,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import { resampleWeekly } from "@/lib/engine";
import { formatCurrency } from "@/lib/format";
import type { SimulationResult } from "@/lib/types";

export interface EquityCurveChartProps {
  result: SimulationResult;
  height?: number;
}

export function EquityCurveChart({
  result,
  height = 440,
}: EquityCurveChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const weekly = resampleWeekly(result.portfolioHistory);
    if (weekly.length === 0) {
      return emptyChartOption(
        "Equity Curve — Strategy vs Buy & Hold",
        "No portfolio history available."
      );
    }

    const weeklyDates: string[] = [];
    const bhPoints: Array<[string, number]> = [];
    const stratPoints: Array<[string, number]> = [];
    const allPositives: number[] = [];

    for (const pt of weekly) {
      weeklyDates.push(pt.date);
      if (Number.isFinite(pt.buyAndHoldValue) && pt.buyAndHoldValue > 0) {
        bhPoints.push([pt.date, pt.buyAndHoldValue]);
        allPositives.push(pt.buyAndHoldValue);
      }
      if (Number.isFinite(pt.portfolioValue) && pt.portfolioValue > 0) {
        stratPoints.push([pt.date, pt.portfolioValue]);
        allPositives.push(pt.portfolioValue);
      }
    }

    const markerSeries = buildTradeMarkerSeries(
      result.tradeLog,
      weeklyDates,
      (idx) => {
        const val = weekly[idx]?.portfolioValue;
        return val !== undefined && Number.isFinite(val) && val > 0 ? val : null;
      }
    );

    return {
      backgroundColor: "transparent",
      useUTC: true,
      animation: false,
      title: {
        text: "Equity Curve — Strategy vs Buy & Hold",
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
        data: ["Buy & Hold", "Strategy Equity", "Buy Signal", "Sell Signal"],
      },
      grid: {
        left: 68,
        right: 24,
        top: 68,
        bottom: 64,
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
            .filter(
              (item) =>
                item.seriesName === "Buy & Hold" ||
                item.seriesName === "Strategy Equity"
            )
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
          name: "Buy & Hold",
          type: "line",
          data: bhPoints,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.benchmark,
            width: 1.5,
            type: "dotted",
            opacity: 0.85,
          },
          itemStyle: { color: CHART_COLORS.benchmark },
        },
        {
          name: "Strategy Equity",
          type: "line",
          data: stratPoints,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.strategy,
            width: 2,
          },
          itemStyle: { color: CHART_COLORS.strategy },
          areaStyle: {
            color: "rgba(10, 124, 110, 0.08)",
            origin: "start",
          },
        },
        ...markerSeries,
      ],
    };
  }, [result]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel="Strategy equity curve compared to Buy and Hold"
    />
  );
}
