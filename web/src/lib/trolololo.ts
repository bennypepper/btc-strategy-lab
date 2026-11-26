export const ORIGIN_DATE = "2012-01-01";

export const TOP_SLOPE = 2.9;
export const TOP_OFFSET = 1400;
export const BOTTOM_SLOPE = 2.788;
export const BOTTOM_OFFSET = 1200;
export const INTERCEPT = 19.463;
export const FIRST_HIGH_CORRECTION = 0.6;

export const CONFIRMED_HIGHS: readonly string[] = [
  "2013-04-09",
  "2013-11-30",
  "2017-12-17",
  "2021-11-10",
];

export const CONFIRMED_LOWS: readonly string[] = [
  "2012-11-18",
  "2015-01-14",
  "2018-12-15",
  "2022-11-21",
];

const MS_PER_DAY = 86_400_000;
const ORIGIN_UTC_MS = Date.UTC(2012, 0, 1);

/**
 * Compute exact UTC calendar days since 2012-01-01 without local timezone or DST drift.
 */
export function daysSinceOrigin(dateStr: string): number {
  const parts = dateStr.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid ISO date string: "${dateStr}"`);
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Invalid ISO date string: "${dateStr}"`);
  }
  return (Date.UTC(year, month - 1, day) - ORIGIN_UTC_MS) / MS_PER_DAY;
}

function nearestIndex(dRaw: number[], targetDay: number): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < dRaw.length; i++) {
    const day = dRaw[i];
    if (day === undefined) continue;
    const dist = Math.abs(day - targetDay);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function linearRegression(
  xs: number[],
  ys: number[]
): { slope: number; intercept: number } {
  const n = xs.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i] ?? 0;
    sumY += ys[i] ?? 0;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    cov += dx * dy;
    varX += dx * dx;
  }

  const slope = varX === 0 ? 0 : cov / varX;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

interface ChannelLogResult {
  priceLog: number[];
  channelTop: number[];
  channelBottom: number[];
  valid: boolean[];
}

function computeChannelLog(
  dates: string[],
  btcClose: number[]
): ChannelLogResult {
  if (dates.length !== btcClose.length) {
    throw new Error("dates and btcClose must have equal length.");
  }

  const n = dates.length;
  const dRaw = new Array<number>(n);
  const valid = new Array<boolean>(n);
  let validCount = 0;

  for (let i = 0; i < n; i++) {
    const dateStr = dates[i];
    const price = btcClose[i];
    if (dateStr === undefined || price === undefined) {
      throw new Error(`Missing data at index ${i}`);
    }
    const day = daysSinceOrigin(dateStr);
    dRaw[i] = day;
    const isRowValid = day > 0 && Number.isFinite(price) && price > 0;
    valid[i] = isRowValid;
    if (isRowValid) {
      validCount += 1;
    }
  }

  if (validCount < 10) {
    throw new Error("Insufficient valid data points (need >= 10).");
  }

  const ln10 = Math.log(10);
  const priceLog = new Array<number>(n).fill(Number.NaN);
  const topBase = new Array<number>(n).fill(Number.NaN);
  const bottomBase = new Array<number>(n).fill(Number.NaN);
  const resTop = new Array<number>(n).fill(Number.NaN);
  const resBottom = new Array<number>(n).fill(Number.NaN);

  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    const day = dRaw[i] as number;
    const price = btcClose[i] as number;
    const lp = Math.log(price);
    const tb = ln10 * (TOP_SLOPE * Math.log(day + TOP_OFFSET) - INTERCEPT);
    const bb = ln10 * (BOTTOM_SLOPE * Math.log(day + BOTTOM_OFFSET) - INTERCEPT);
    priceLog[i] = lp;
    topBase[i] = tb;
    bottomBase[i] = bb;
    resTop[i] = lp - tb;
    resBottom[i] = lp - bb;
  }

  const firstDay = dRaw[0] as number;
  const lastDay = dRaw[n - 1] as number;
  const highMarks = new Array<boolean>(n).fill(false);
  const lowMarks = new Array<boolean>(n).fill(false);

  for (const markDate of CONFIRMED_HIGHS) {
    const markDay = daysSinceOrigin(markDate);
    if (markDay >= firstDay && markDay <= lastDay) {
      highMarks[nearestIndex(dRaw, markDay)] = true;
    }
  }
  for (const markDate of CONFIRMED_LOWS) {
    const markDay = daysSinceOrigin(markDate);
    if (markDay >= firstDay && markDay <= lastDay) {
      lowMarks[nearestIndex(dRaw, markDay)] = true;
    }
  }

  const hiIdx: number[] = [];
  const loIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (highMarks[i] && Number.isFinite(resTop[i])) {
      hiIdx.push(i);
    }
    if (lowMarks[i] && Number.isFinite(resBottom[i])) {
      loIdx.push(i);
    }
  }

  if (hiIdx.length < 2 || loIdx.length < 2) {
    return {
      priceLog,
      channelTop: topBase,
      channelBottom: bottomBase,
      valid,
    };
  }

  const hiX = hiIdx.map((idx) => dRaw[idx] as number);
  const hiY = hiIdx.map((idx) => resTop[idx] as number);
  hiY[0] = (hiY[0] as number) * FIRST_HIGH_CORRECTION;
  const topFit = linearRegression(hiX, hiY);

  const loX = loIdx.map((idx) => dRaw[idx] as number);
  const loY = loIdx.map((idx) => resBottom[idx] as number);
  const bottomFit = linearRegression(loX, loY);

  const channelTop = new Array<number>(n).fill(Number.NaN);
  const channelBottom = new Array<number>(n).fill(Number.NaN);

  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    const day = dRaw[i] as number;
    channelTop[i] =
      (topBase[i] as number) + (topFit.slope * day + topFit.intercept);
    channelBottom[i] =
      (bottomBase[i] as number) +
      (bottomFit.slope * day + bottomFit.intercept);
  }

  return { priceLog, channelTop, channelBottom, valid };
}

/**
 * Compute the Dynamic Channel Normalization Trolololo index in [0, 100].
 * Matches core/trolololo.py:compute_trolololo (include_algo_marks=False).
 */
export function computeTrolololo(
  dates: string[],
  btcClose: number[]
): (number | null)[] {
  const { priceLog, channelTop, channelBottom, valid } = computeChannelLog(
    dates,
    btcClose
  );
  const n = dates.length;
  const result = new Array<number | null>(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    const top = channelTop[i] as number;
    const bottom = channelBottom[i] as number;
    const range = top - bottom;
    if (range <= 1e-6) continue;
    const raw = ((priceLog[i] as number) - bottom) / range;
    if (!Number.isFinite(raw)) continue;
    const clipped = Math.min(1, Math.max(0, raw));
    result[i] = clipped * 100;
  }

  return result;
}

/**
 * Compute the adaptive Trolololo upper and lower channel bands in USD price space.
 * Matches core/trolololo.py:compute_trolololo_bands (include_algo_marks=False).
 */
export function computeTrolololoBands(
  dates: string[],
  btcClose: number[]
): { topBand: (number | null)[]; bottomBand: (number | null)[] } {
  const { channelTop, channelBottom, valid } = computeChannelLog(
    dates,
    btcClose
  );
  const n = dates.length;
  const topBand = new Array<number | null>(n).fill(null);
  const bottomBand = new Array<number | null>(n).fill(null);

  for (let i = 0; i < n; i++) {
    if (!valid[i]) continue;
    topBand[i] = Math.exp(channelTop[i] as number);
    bottomBand[i] = Math.exp(channelBottom[i] as number);
  }

  return { topBand, bottomBand };
}
