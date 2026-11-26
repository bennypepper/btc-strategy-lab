import { computeTrolololo } from "./trolololo";
import { YahooChartResponseSchema, type ColumnarDataset } from "./types";

export interface DailyPriceBars {
  dates: string[];
  btc_open: number[];
  btc_close: number[];
}

/**
 * Validate and extract clean UTC daily OHLC (open/close) bars from a Yahoo Finance v8 chart response.
 * Drops any row with null, non-finite, or non-positive open/close prices.
 */
export function parseYahooChartBars(rawJson: unknown): DailyPriceBars {
  const parsed = YahooChartResponseSchema.parse(rawJson);
  const results = parsed.chart.result;
  if (!results || results.length === 0) {
    throw new Error("Yahoo Finance response contains no chart results.");
  }

  const first = results[0];
  if (!first) {
    throw new Error("Yahoo Finance response missing primary chart result.");
  }

  const timestamps = first.timestamp ?? [];
  const quote = first.indicators.quote[0];
  const opens = quote?.open ?? [];
  const closes = quote?.close ?? [];

  const dates: string[] = [];
  const btc_open: number[] = [];
  const btc_close: number[] = [];

  const len = Math.min(timestamps.length, opens.length, closes.length);
  for (let i = 0; i < len; i++) {
    const ts = timestamps[i];
    const open = opens[i];
    const close = closes[i];
    if (
      ts === undefined ||
      !Number.isFinite(ts) ||
      open === null ||
      open === undefined ||
      !Number.isFinite(open) ||
      open <= 0 ||
      close === null ||
      close === undefined ||
      !Number.isFinite(close) ||
      close <= 0
    ) {
      continue;
    }

    const isoDate = new Date(ts * 1000).toISOString().slice(0, 10);
    dates.push(isoDate);
    btc_open.push(open);
    btc_close.push(close);
  }

  return { dates, btc_open, btc_close };
}

/**
 * Merge live Yahoo Finance daily bars onto the static master dataset.
 * Deduplicates with keep="last", sorts ascending by ISO date, filters invalid prices,
 * and recomputes Trolololo deterministically (0.0 retroactive shift on pre-2026 history).
 */
export function mergeLiveDelta(
  staticData: ColumnarDataset,
  delta: DailyPriceBars
): ColumnarDataset {
  const byDate = new Map<string, { open: number; close: number }>();

  for (let i = 0; i < staticData.dates.length; i++) {
    const date = staticData.dates[i];
    const open = staticData.btc_open[i];
    const close = staticData.btc_close[i];
    if (
      date !== undefined &&
      open !== undefined &&
      close !== undefined &&
      Number.isFinite(open) &&
      open > 0 &&
      Number.isFinite(close) &&
      close > 0
    ) {
      byDate.set(date, { open, close });
    }
  }

  for (let i = 0; i < delta.dates.length; i++) {
    const date = delta.dates[i];
    const open = delta.btc_open[i];
    const close = delta.btc_close[i];
    if (
      date !== undefined &&
      open !== undefined &&
      close !== undefined &&
      Number.isFinite(open) &&
      open > 0 &&
      Number.isFinite(close) &&
      close > 0
    ) {
      byDate.set(date, { open, close });
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const btc_open = new Array<number>(sortedDates.length);
  const btc_close = new Array<number>(sortedDates.length);

  for (let i = 0; i < sortedDates.length; i++) {
    const bar = byDate.get(sortedDates[i] as string) as {
      open: number;
      close: number;
    };
    btc_open[i] = bar.open;
    btc_close[i] = bar.close;
  }

  const trolololo = computeTrolololo(sortedDates, btc_close);
  return {
    dates: sortedDates,
    btc_open,
    btc_close,
    trolololo,
  };
}
