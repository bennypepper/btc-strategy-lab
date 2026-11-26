"use client";

import { useMemo } from "react";
import { EChartCanvas } from "@/components/EChartCanvas";
import {
  asTooltipItems,
  BASE_LEGEND_STYLE,
  BASE_TOOLTIP_STYLE,
  CHART_COLORS,
  CHART_FONT,
  createLogDollarYAxis,
  createTimeXAxis,
  emptyChartOption,
  escapeHtml,
  formatUtcDate,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import { resampleWeekly } from "@/lib/engine";
import { formatCurrency } from "@/lib/format";
import type { SimulationResult } from "@/lib/types";

export interface IsOosEquityChartProps {
  result: SimulationResult;
  title: string;
  splitDate?: string;
  height?: number;
}

export function IsOosEquityChart({
  result,
  title,
  splitDate = "2021-01-01",
  height = 370,
}: IsOosEquityChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const weekly = resampleWeekly(result.portfolioHistory);
    if (weekly.length === 0) {
      return emptyChartOption(title, "No portfolio history available.");
    }

    const bhPoints: Array<[string, number]> = [];
    const isPoints: Array<[string, number]> = [];
    const oosPoints: Array<[string, number]> = [];
    const allPositives: number[] = [];

    for (const pt of weekly) {
      if (Number.isFinite(pt.buyAndHoldValue) && pt.buyAndHoldValue > 0) {
        bhPoints.push([pt.date, pt.buyAndHoldValue]);
        allPositives.push(pt.buyAndHoldValue);
      }
      if (Number.isFinite(pt.portfolioValue) && pt.portfolioValue > 0) {
        allPositives.push(pt.portfolioValue);
        if (pt.date < splitDate) {
          isPoints.push([pt.date, pt.portfolioValue]);
        } else {
          oosPoints.push([pt.date, pt.portfolioValue]);
        }
      }
    }

    const firstDate = weekly[0]?.date ?? "";
    const lastDate = weekly[weekly.length - 1]?.date ?? "";
    const showSplitLine =
      firstDate !== "" &&
      lastDate !== "" &&
      splitDate >= firstDate &&
      splitDate <= lastDate;

    return {
      backgroundColor: "transparent",
      useUTC: true,
      animation: false,
      title: {
        text: title,
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
        data: [
          "Buy & Hold",
          "Strategy IS (2012–2020)",
          "Strategy OOS (2021–2026)",
        ],
      },
      grid: {
        left: 72,
        right: 24,
        top: 72,
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
      yAxis: createLogDollarYAxis(allPositives, "Portfolio Value"),
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
            opacity: 0.8,
          },
          itemStyle: { color: CHART_COLORS.benchmark },
          markLine: showSplitLine
            ? {
                silent: true,
                symbol: ["none", "none"],
                data: [
                  {
                    xAxis: splitDate,
                    lineStyle: {
                      color: CHART_COLORS.axisLine,
                      width: 1.4,
                      type: "dashed",
                    },
                    label: {
                      formatter: "IS | OOS split",
                      position: "insideEndTop",
                      color: CHART_COLORS.textMuted,
                      fontFamily: CHART_FONT,
                      fontSize: 10,
                      fontWeight: 600,
                    },
                  },
                ],
              }
            : undefined,
        },
        {
          name: "Strategy IS (2012–2020)",
          type: "line",
          data: isPoints,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.strategy,
            width: 2,
          },
          itemStyle: { color: CHART_COLORS.strategy },
          areaStyle: {
            color: "rgba(10, 124, 110, 0.09)",
            origin: "start",
          },
        },
        {
          name: "Strategy OOS (2021–2026)",
          type: "line",
          data: oosPoints,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: {
            color: CHART_COLORS.signalLine,
            width: 2,
          },
          itemStyle: { color: CHART_COLORS.signalLine },
        },
      ],
    };
  }, [result, title, splitDate]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel={`${title} in-sample versus out-of-sample equity chart`}
    />
  );
}
