"use client";

import { useMemo } from "react";
import { EChartCanvas } from "@/components/EChartCanvas";
import {
  asTooltipItems,
  BASE_TOOLTIP_STYLE,
  CHART_COLORS,
  CHART_FONT,
  computePercentile,
  emptyChartOption,
  escapeHtml,
  type EChartsCoreOption,
} from "@/lib/echarts-setup";
import { formatPercentage } from "@/lib/format";
import type { HeatmapMatrix } from "@/lib/types";

export interface SensitivityHeatmapChartProps {
  matrix: HeatmapMatrix;
  title: string;
  metricLabel?: string;
  height?: number;
}

// ColorBrewer 11-stop RdYlGn palette (low = red, high = green)
const RDYLGN_STOPS = [
  "#a50026",
  "#d73027",
  "#f46d43",
  "#fdae61",
  "#fee08b",
  "#ffffbf",
  "#d9ef8b",
  "#a6d96a",
  "#66bd63",
  "#1a9850",
  "#006837",
];

export function SensitivityHeatmapChart({
  matrix,
  title,
  metricLabel = "Total Return",
  height = 440,
}: SensitivityHeatmapChartProps) {
  const option = useMemo<EChartsCoreOption>(() => {
    const { xLabels, yLabels, values } = matrix;
    if (xLabels.length === 0 || yLabels.length === 0 || values.length === 0) {
      return emptyChartOption(title, "No sensitivity heatmap data available.");
    }

    const validValues: number[] = [];
    for (let r = 0; r < yLabels.length; r += 1) {
      const row = values[r];
      if (!row) continue;
      for (let c = 0; c < xLabels.length; c += 1) {
        const cell = row[c];
        if (cell !== null && cell !== undefined && Number.isFinite(cell)) {
          validValues.push(cell);
        }
      }
    }

    if (validValues.length === 0) {
      return emptyChartOption(title, "All heatmap cells are empty.");
    }

    validValues.sort((a, b) => a - b);
    const minVal = validValues[0]!;
    const p99 = computePercentile(validValues, 99);
    const maxVal = p99 > minVal ? p99 : minVal + 1;

    // Store [colIdx, rowIdx, clippedVal, rawVal]
    const heatmapData: Array<[number, number, number, number]> = [];
    for (let r = 0; r < yLabels.length; r += 1) {
      const row = values[r];
      if (!row) continue;
      for (let c = 0; c < xLabels.length; c += 1) {
        const raw = row[c];
        if (raw !== null && raw !== undefined && Number.isFinite(raw)) {
          const clipped = Math.min(raw, p99);
          heatmapData.push([c, r, clipped, raw]);
        }
      }
    }

    const isReturnMetric = metricLabel.toLowerCase().includes("return");

    return {
      backgroundColor: "transparent",
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
      grid: {
        left: 60,
        right: 92,
        top: 48,
        bottom: 52,
      },
      tooltip: {
        ...BASE_TOOLTIP_STYLE,
        trigger: "item",
        formatter: (rawParam: unknown) => {
          const item = asTooltipItems(rawParam)[0];
          const tuple = Array.isArray(item?.value) ? item.value : [];
          const colIdx = Number(tuple[0]);
          const rowIdx = Number(tuple[1]);
          const rawVal = Number(tuple[3]);
          const buyThreshold = xLabels[colIdx] ?? "?";
          const sellThreshold = yLabels[rowIdx] ?? "?";
          const formattedMetric = Number.isFinite(rawVal)
            ? isReturnMetric
              ? formatPercentage(rawVal * 100)
              : rawVal.toLocaleString("en-US", { maximumFractionDigits: 2 })
            : "N/A";
          return (
            `<div>Buy Threshold: <b>${escapeHtml(String(buyThreshold))}</b></div>` +
            `<div>Sell Threshold: <b>${escapeHtml(String(sellThreshold))}</b></div>` +
            `<div>${escapeHtml(metricLabel)}: <b>${escapeHtml(
              formattedMetric
            )}</b></div>`
          );
        },
      },
      xAxis: {
        type: "category",
        data: xLabels.map(String),
        name: "Buy Threshold",
        nameLocation: "middle",
        nameGap: 30,
        nameTextStyle: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 11,
          fontWeight: 600,
        },
        axisLine: { lineStyle: { color: CHART_COLORS.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 10,
        },
      },
      yAxis: {
        type: "category",
        data: yLabels.map(String),
        inverse: true,
        name: "Sell Threshold",
        nameLocation: "middle",
        nameGap: 42,
        nameTextStyle: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 11,
          fontWeight: 600,
        },
        axisLine: { lineStyle: { color: CHART_COLORS.axisLine } },
        axisTick: { show: false },
        axisLabel: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 10,
        },
      },
      visualMap: {
        min: minVal,
        max: maxVal,
        calculable: false,
        orient: "vertical",
        right: 8,
        top: "middle",
        itemHeight: 220,
        itemWidth: 14,
        inRange: {
          color: RDYLGN_STOPS,
        },
        textStyle: {
          color: CHART_COLORS.text,
          fontFamily: CHART_FONT,
          fontSize: 10,
        },
        formatter: (val: number) =>
          isReturnMetric
            ? formatPercentage(val * 100)
            : val.toLocaleString("en-US", { maximumFractionDigits: 1 }),
      },
      series: [
        {
          name: metricLabel,
          type: "heatmap",
          data: heatmapData,
          emphasis: {
            itemStyle: {
              borderColor: CHART_COLORS.text,
              borderWidth: 1,
            },
          },
        },
      ],
    };
  }, [matrix, title, metricLabel]);

  return (
    <EChartCanvas
      option={option}
      height={height}
      ariaLabel={`${title} parameter sensitivity heatmap`}
    />
  );
}
