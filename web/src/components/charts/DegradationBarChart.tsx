"use client";

import { useMemo } from "react";
import { EChartCanvas } from "@/components/EChartCanvas";
import {
  asTooltipItems,
  BASE_LEGEND_STYLE,
  BASE_TOOLTIP_STYLE,
  CHART_COLORS,
  CHART_FONT,
  emptyChartOption,
  escapeHtml,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import {
  OBJECTIVE_KEYS,
  type DegradationEntry,
  type ObjectiveKey,
} from "@/lib/types";

export interface DegradationBarChartProps {
  degradation: Record<ObjectiveKey, DegradationEntry>;
  height?: number;
}

const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  max_return: "Max Return",
  min_drawdown: "Min Drawdown",
  max_sharpe: "Max Sharpe",
};

function finiteOrZero(val: unknown): number {
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

export function DegradationBarChart({
  degradation,
  height = 330,
}: DegradationBarChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const keys = OBJECTIVE_KEYS.filter((k) => degradation[k] !== undefined);
    if (keys.length === 0) {
      return emptyChartOption(
        "IS → OOS Performance Degradation by Objective",
        "No degradation metrics available."
      );
    }

    const categories = keys.map((k) => OBJECTIVE_LABELS[k]);
    const retDeg = keys.map((k) =>
      finiteOrZero(degradation[k].return_degradation_pct)
    );
    const sharpeDeg = keys.map((k) =>
      finiteOrZero(degradation[k].sharpe_degradation_pct)
    );
    const ddDeg = keys.map((k) =>
      finiteOrZero(degradation[k].drawdown_degradation_pct)
    );

    return {
      backgroundColor: "transparent",
      animation: false,
      title: {
        text: "IS → OOS Performance Degradation by Objective",
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
          "Return Degradation %",
          "Sharpe Degradation %",
          "Drawdown Change %",
        ],
      },
      grid: {
        left: 64,
        right: 24,
        top: 72,
        bottom: 36,
      },
      tooltip: {
        ...BASE_TOOLTIP_STYLE,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (raw: unknown) => {
          const items = asTooltipItems(raw);
          if (items.length === 0) return "";
          const header = String(items[0]?.axisValue ?? items[0]?.name ?? "");
          const rows = items
            .map((item) => {
              const v = Number(item.value);
              const formatted = Number.isFinite(v) ? `${v.toFixed(1)}%` : "N/A";
              return `<div>${item.marker ?? ""}${escapeHtml(
                item.seriesName ?? ""
              )}: <b>${escapeHtml(formatted)}</b></div>`;
            })
            .join("");
          return `<div style="font-weight:700;margin-bottom:4px;">${escapeHtml(
            header
          )}</div>${rows}`;
        },
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: { lineStyle: { color: CHART_COLORS.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 11,
          fontWeight: 600,
        },
      },
      yAxis: {
        type: "value",
        name: "Degradation (%)",
        nameTextStyle: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 11,
        },
        splitLine: {
          show: true,
          lineStyle: { color: CHART_COLORS.grid, width: 1 },
        },
        axisLine: { show: false },
        axisLabel: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 11,
          formatter: "{value}%",
        },
      },
      series: [
        {
          name: "Return Degradation %",
          type: "bar",
          data: retDeg,
          barMaxWidth: 34,
          itemStyle: { color: CHART_COLORS.sellMarker, opacity: 0.88 },
        },
        {
          name: "Sharpe Degradation %",
          type: "bar",
          data: sharpeDeg,
          barMaxWidth: 34,
          itemStyle: { color: CHART_COLORS.sharpeBar, opacity: 0.88 },
        },
        {
          name: "Drawdown Change %",
          type: "bar",
          data: ddDeg,
          barMaxWidth: 34,
          itemStyle: { color: CHART_COLORS.benchmark, opacity: 0.88 },
        },
      ],
    };
  }, [degradation]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel="In-sample to out-of-sample degradation bar chart"
    />
  );
}
