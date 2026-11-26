"use client";

import { useMemo } from "react";
import { EChartCanvas } from "@/components/EChartCanvas";
import {
  asTooltipItems,
  BASE_TOOLTIP_STYLE,
  CHART_COLORS,
  CHART_FONT,
  emptyChartOption,
  escapeHtml,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import { formatCompactPercent } from "@/lib/format";
import type { ResearchSummary } from "@/lib/types";

export interface ComparisonBarChartProps {
  results: ResearchSummary;
  height?: number;
}

const SCENARIO_COLORS = [
  CHART_COLORS.strategy,
  CHART_COLORS.secondaryScenario,
  CHART_COLORS.benchmark,
] as const;

const SCENARIO_LABELS = [
  "S1 OOS\n(Validated)",
  "S2 Full\n(Exploration)",
  "Buy & Hold\n(OOS)",
] as const;

function safeFinite(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function ComparisonBarChart({
  results,
  height = 390,
}: ComparisonBarChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const s1Oos = results?.scenario_1?.out_of_sample?.max_return;
    const s2Full = results?.scenario_2?.full_dataset?.max_return;
    const bhOos = results?.buy_and_hold_benchmark?.out_of_sample;

    if (!s1Oos || !s2Full || !bhOos) {
      return emptyChartOption(
        "Performance Comparison — S1 OOS vs S2 Full vs Buy & Hold",
        "Comparison metrics unavailable."
      );
    }

    const returns = [
      safeFinite(s1Oos.total_return) * 100,
      safeFinite(s2Full.total_return) * 100,
      safeFinite(bhOos.total_return) * 100,
    ];
    const drawdowns = [
      safeFinite(s1Oos.max_drawdown) * 100,
      safeFinite(s2Full.max_drawdown) * 100,
      safeFinite(bhOos.max_drawdown) * 100,
    ];
    const sharpes = [
      safeFinite(s1Oos.sharpe_ratio),
      safeFinite(s2Full.sharpe_ratio),
      safeFinite(bhOos.sharpe_ratio),
    ];

    const hasPositiveReturns = returns.some((r) => r > 0);
    const positiveReturns = returns.filter((r) => r > 0);
    const logMin = hasPositiveReturns
      ? Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.min(...positiveReturns)))))
      : 1;
    const logMax = hasPositiveReturns
      ? Math.pow(10, Math.ceil(Math.log10(Math.max(...positiveReturns))))
      : 10000;

    const makeColoredBars = (vals: number[], guardLog = false) =>
      vals.map((val, idx) => ({
        value: guardLog && val <= 0 ? null : val,
        itemStyle: { color: SCENARIO_COLORS[idx], opacity: 0.88 },
      }));

    return {
      backgroundColor: "transparent",
      animation: false,
      title: [
        {
          text: "Performance Comparison — S1 OOS vs S2 Full vs Buy & Hold",
          left: 8,
          top: 4,
          textStyle: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 14,
            fontWeight: 700,
          },
        },
        {
          text: "Total Return (%)",
          left: "18.5%",
          top: 40,
          textAlign: "center",
          textStyle: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 12,
            fontWeight: 600,
          },
        },
        {
          text: "Max Drawdown (%)",
          left: "52.5%",
          top: 40,
          textAlign: "center",
          textStyle: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 12,
            fontWeight: 600,
          },
        },
        {
          text: "Sharpe Ratio",
          left: "86.5%",
          top: 40,
          textAlign: "center",
          textStyle: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 12,
            fontWeight: 600,
          },
        },
      ],
      tooltip: {
        ...BASE_TOOLTIP_STYLE,
        trigger: "item",
        formatter: (raw: unknown) => {
          const item = asTooltipItems(raw)[0];
          if (!item) return "";
          const label = String(item.name ?? "").replaceAll("\n", " ");
          const val = Number(item.value);
          const sName = item.seriesName ?? "";
          let formatted = "N/A";
          if (Number.isFinite(val)) {
            if (sName === "Total Return (%)") {
              formatted = `${val.toLocaleString("en-US", {
                maximumFractionDigits: 1,
              })}%`;
            } else if (sName === "Max Drawdown (%)") {
              formatted = `${val.toFixed(1)}%`;
            } else {
              formatted = val.toFixed(3);
            }
          }
          return (
            `<div style="font-weight:700;margin-bottom:2px;">${escapeHtml(
              label
            )}</div>` +
            `<div>${item.marker ?? ""}${escapeHtml(sName)}: <b>${escapeHtml(
              formatted
            )}</b></div>`
          );
        },
      },
      grid: [
        { left: "7%", width: "23%", top: 74, bottom: 48 },
        { left: "41%", width: "23%", top: 74, bottom: 48 },
        { left: "75%", width: "22%", top: 74, bottom: 48 },
      ],
      xAxis: [0, 1, 2].map((gridIndex) => ({
        gridIndex,
        type: "category",
        data: [...SCENARIO_LABELS],
        axisLine: { lineStyle: { color: CHART_COLORS.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 10,
          interval: 0,
        },
      })),
      yAxis: [
        {
          gridIndex: 0,
          type: hasPositiveReturns ? "log" : "value",
          logBase: 10,
          min: hasPositiveReturns ? logMin : 0,
          max: hasPositiveReturns
            ? logMax > logMin
              ? logMax
              : logMin * 10
            : undefined,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: CHART_COLORS.grid, width: 1 } },
          axisLabel: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 10,
            formatter: (v: number) => formatCompactPercent(v),
          },
        },
        {
          gridIndex: 1,
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: CHART_COLORS.grid, width: 1 } },
          axisLabel: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 10,
            formatter: "{value}%",
          },
        },
        {
          gridIndex: 2,
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: CHART_COLORS.grid, width: 1 } },
          axisLabel: {
            color: CHART_COLORS.text,
            fontFamily: CHART_FONT,
            fontSize: 10,
            formatter: (v: number) => v.toFixed(2),
          },
        },
      ],
      series: [
        {
          name: "Total Return (%)",
          type: "bar",
          xAxisIndex: 0,
          yAxisIndex: 0,
          barMaxWidth: 38,
          data: makeColoredBars(returns, hasPositiveReturns),
        },
        {
          name: "Max Drawdown (%)",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          barMaxWidth: 38,
          data: makeColoredBars(drawdowns),
        },
        {
          name: "Sharpe Ratio",
          type: "bar",
          xAxisIndex: 2,
          yAxisIndex: 2,
          barMaxWidth: 38,
          data: makeColoredBars(sharpes),
        },
      ],
    };
  }, [results]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel="Three-panel performance comparison across S1 OOS, S2 Full, and Buy and Hold"
    />
  );
}
