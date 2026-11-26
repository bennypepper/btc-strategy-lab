"use client";

import { useEffect, useRef } from "react";
import {
  echarts,
  type EChartsCoreOption,
  type EChartsType,
} from "@/lib/echarts-setup";

export interface EChartCanvasProps {
  option: EChartsCoreOption;
  height?: number;
  className?: string;
  ariaLabel?: string;
}

export function EChartCanvas({
  option,
  height = 400,
  className = "",
  ariaLabel = "Interactive chart",
}: EChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    chartRef.current?.resize();
  }, [height]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{ height: `${height}px`, width: "100%" }}
      className={className}
    />
  );
}
