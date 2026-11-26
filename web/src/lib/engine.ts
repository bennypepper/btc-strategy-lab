import {
  BacktestParametersSchema,
  type BacktestParameters,
  type BenchmarkMetrics,
  type ColumnarDataset,
  type PortfolioPoint,
  type SimulationResult,
  type StrategyMetrics,
  type TradeRow,
} from "./types";

const RISK_FREE_DAILY = 0.04 / 365.0;
const SQRT_365 = Math.sqrt(365.0);
const MIN_BUY_USD = 1.0;
const MIN_SELL_BTC = 0.000001;
const MS_PER_DAY = 86_400_000;

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function meanAndPopulationStd(values: number[]): { mean: number; std: number } {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, std: 0 };
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i] ?? 0;
  }
  const mean = sum / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const diff = (values[i] ?? 0) - mean;
    sumSq += diff * diff;
  }
  return { mean, std: Math.sqrt(sumSq / n) };
}

/**
 * Slice a ColumnarDataset inclusively by ISO date range [startDate, endDate].
 */
export function sliceDataset(
  dataset: ColumnarDataset,
  startDate: string,
  endDate: string
): ColumnarDataset {
  const dates: string[] = [];
  const btc_open: number[] = [];
  const btc_close: number[] = [];
  const trolololo: (number | null)[] = [];

  for (let i = 0; i < dataset.dates.length; i++) {
    const d = dataset.dates[i];
    if (d === undefined) continue;
    if (d >= startDate && d <= endDate) {
      dates.push(d);
      btc_open.push(dataset.btc_open[i] as number);
      btc_close.push(dataset.btc_close[i] as number);
      trolololo.push(dataset.trolololo[i] ?? null);
    }
  }

  return { dates, btc_open, btc_close, trolololo };
}

function computeStrategyMetrics(
  pv: number[],
  dr: number[],
  dates: string[],
  initialCash: number,
  tradeCount: number,
  sellCount: number,
  wins: number,
  finalCash: number,
  finalBtc: number
): StrategyMetrics {
  const n = pv.length;
  const finalPortfolioValue = pv[n - 1] ?? initialCash;
  const totalReturn = (finalPortfolioValue - initialCash) / initialCash;

  let maxDrawdown = 0;
  let maxDrawdownIdx = 0;
  let peak = pv[0] ?? initialCash;
  for (let i = 0; i < n; i++) {
    const val = pv[i] ?? 0;
    if (val > peak) {
      peak = val;
    }
    const dd = peak > 0 ? (peak - val) / peak : 0;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownIdx = i;
    }
  }

  const maxDrawdownDate = dates[maxDrawdownIdx] ?? "";
  const buyCount = tradeCount - sellCount;

  const returnsSlice = n > 1 ? dr.slice(1) : dr;
  const { mean, std } = meanAndPopulationStd(returnsSlice);
  const sharpeRatio =
    std > 0 ? ((mean - RISK_FREE_DAILY) / std) * SQRT_365 : 0;

  const winRate = sellCount > 0 ? wins / sellCount : 0;

  return {
    totalReturn,
    maxDrawdown,
    maxDrawdownDate,
    sharpeRatio,
    winRate,
    tradeCount,
    buyCount,
    sellCount,
    finalCash,
    finalBtc,
    finalPortfolioValue,
  };
}

function computeBenchmarkMetrics(
  pricesOpen: number[],
  pricesClose: number[],
  initialCash: number,
  feeRate: number
): { bhValues: number[]; benchmarkMetrics: BenchmarkMetrics } {
  const n = pricesClose.length;
  const firstOpen = pricesOpen[0] as number;
  const bhBtc = (initialCash * (1 - feeRate)) / firstOpen;

  const bhValues = new Array<number>(n);
  let bhPeak = pricesClose[0] as number;
  let bhMdd = 0;

  for (let i = 0; i < n; i++) {
    const close = pricesClose[i] as number;
    bhValues[i] = bhBtc * close;
    if (close > bhPeak) {
      bhPeak = close;
    }
    const dd = bhPeak > 0 ? (bhPeak - close) / bhPeak : 0;
    if (dd > bhMdd) {
      bhMdd = dd;
    }
  }

  const bhDailyRet = new Array<number>(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) {
    const prev = pricesClose[i - 1] as number;
    const curr = pricesClose[i] as number;
    bhDailyRet[i - 1] = (curr - prev) / prev;
  }

  const { mean, std } = meanAndPopulationStd(bhDailyRet);
  const bhSharpe = std > 0 ? ((mean - RISK_FREE_DAILY) / std) * SQRT_365 : 0;
  const finalValue = bhValues[n - 1] ?? initialCash;
  const totalReturn = (finalValue - initialCash) / initialCash;

  return {
    bhValues,
    benchmarkMetrics: {
      totalReturn,
      maxDrawdown: bhMdd,
      sharpeRatio: bhSharpe,
      finalValue,
    },
  };
}

/**
 * Full-trace backtest engine with strict T+1 open execution and exact parity to core/engine.py.
 */
export function runBacktestFull(
  dataset: ColumnarDataset,
  rawParams: BacktestParameters
): SimulationResult {
  const params = BacktestParametersSchema.parse(rawParams);

  const rawLen = dataset.dates.length;
  if (
    dataset.btc_open.length !== rawLen ||
    dataset.btc_close.length !== rawLen ||
    dataset.trolololo.length !== rawLen
  ) {
    throw new Error("Dataset columns must have equal length.");
  }

  const dates: string[] = [];
  const signals: number[] = [];
  const pricesOpen: number[] = [];
  const pricesClose: number[] = [];

  for (let i = 0; i < rawLen; i++) {
    const sig = dataset.trolololo[i];
    if (sig === null || sig === undefined) continue;
    const d = dataset.dates[i];
    const open = dataset.btc_open[i];
    const close = dataset.btc_close[i];
    if (d === undefined || open === undefined || close === undefined) continue;

    dates.push(d);
    signals.push(sig);
    pricesOpen.push(open);
    pricesClose.push(close);
  }

  const n = dates.length;
  if (n < 2) {
    throw new Error(
      "Insufficient data points for backtesting (need at least 2)."
    );
  }

  for (let i = 0; i < n; i++) {
    const open = pricesOpen[i] as number;
    const close = pricesClose[i] as number;
    const sig = signals[i] as number;
    if (!Number.isFinite(open) || open <= 0) {
      throw new Error(
        "btc_open must contain only finite, strictly positive values."
      );
    }
    if (!Number.isFinite(close) || close <= 0) {
      throw new Error(
        "btc_close must contain only finite, strictly positive values."
      );
    }
    if (!Number.isFinite(sig)) {
      throw new Error("trolololo must contain only finite values.");
    }
  }

  let cash = params.initialCash;
  let btc = 0;
  let avgEntryPrice = 0;
  let tradeCount = 0;
  let wins = 0;
  let sellCount = 0;

  const pv = new Array<number>(n).fill(0);
  const cashArr = new Array<number>(n).fill(0);
  const btcArr = new Array<number>(n).fill(0);
  const dr = new Array<number>(n).fill(0);
  const tradeLog: TradeRow[] = [];

  pv[0] = params.initialCash;
  cashArr[0] = params.initialCash;
  btcArr[0] = 0;

  for (let i = 0; i < n - 1; i++) {
    const sig = signals[i] as number;
    const pExec = pricesOpen[i + 1] as number; // T+1 open execution
    const pVal = pricesClose[i] as number; // T close valuation

    const currVal = cash + btc * pVal;
    pv[i] = currVal;
    cashArr[i] = cash;
    btcArr[i] = btc;

    if (i > 0) {
      const prev = pv[i - 1] as number;
      dr[i] = prev > 0 ? (currVal - prev) / prev : 0;
    }

    let executedAction:
      | { action: "BUY" | "SELL"; amountUsd: number; btcAmount: number }
      | null = null;

    if (sig <= params.thresholdBuy) {
      const tradeAmount = cash * params.allocBuyPct;
      if (tradeAmount > MIN_BUY_USD) {
        const fee = tradeAmount * params.feeRate;
        const netUsd = tradeAmount - fee;
        const btcBought = netUsd / pExec;
        const totalCost = btc * avgEntryPrice + tradeAmount;
        btc += btcBought;
        avgEntryPrice = btc > 0 ? totalCost / btc : 0;
        cash -= tradeAmount;
        tradeCount += 1;
        executedAction = {
          action: "BUY",
          amountUsd: tradeAmount,
          btcAmount: btcBought,
        };
      }
    } else if (sig >= params.thresholdSell) {
      const btcSold = btc * params.allocSellPct;
      if (btcSold > MIN_SELL_BTC) {
        const grossUsd = btcSold * pExec;
        const fee = grossUsd * params.feeRate;
        const netUsd = grossUsd - fee;
        const costSold = btcSold * avgEntryPrice;
        cash += netUsd;
        btc -= btcSold;
        tradeCount += 1;
        if (netUsd > costSold) {
          wins += 1;
        }
        sellCount += 1;
        executedAction = {
          action: "SELL",
          amountUsd: grossUsd,
          btcAmount: btcSold,
        };
      }
    }

    if (executedAction !== null) {
      const execDate = (dates[i + 1] ?? dates[i]) as string;
      const equityAfter = cash + btc * pExec;
      tradeLog.push({
        date: execDate,
        action: executedAction.action,
        btcPrice: roundTo(pExec, 2),
        amountUsd: roundTo(executedAction.amountUsd, 2),
        btcAmount: roundTo(executedAction.btcAmount, 6),
        signalIndex: roundTo(sig, 1),
        cashAfter: roundTo(cash, 2),
        btcHeldAfter: roundTo(btc, 6),
        equityAfter: roundTo(equityAfter, 2),
      });
    }
  }

  // Final day valuation
  const finalClose = pricesClose[n - 1] as number;
  pv[n - 1] = cash + btc * finalClose;
  cashArr[n - 1] = cash;
  btcArr[n - 1] = btc;
  const prevLast = pv[n - 2] as number;
  dr[n - 1] = prevLast > 0 ? ((pv[n - 1] as number) - prevLast) / prevLast : 0;

  const metrics = computeStrategyMetrics(
    pv,
    dr,
    dates,
    params.initialCash,
    tradeCount,
    sellCount,
    wins,
    cash,
    btc
  );

  const { bhValues, benchmarkMetrics } = computeBenchmarkMetrics(
    pricesOpen,
    pricesClose,
    params.initialCash,
    params.feeRate
  );

  const portfolioHistory = new Array<PortfolioPoint>(n);
  for (let i = 0; i < n; i++) {
    portfolioHistory[i] = {
      date: dates[i] as string,
      portfolioValue: pv[i] as number,
      cash: cashArr[i] as number,
      btcHeld: btcArr[i] as number,
      btcClose: pricesClose[i] as number,
      buyAndHoldValue: bhValues[i] as number,
    };
  }

  return {
    portfolioHistory,
    tradeLog,
    metrics,
    benchmarkMetrics,
    lowSampleWarning: tradeCount < 10,
    params,
  };
}

function sundayBucketKey(dateStr: string): string {
  const parts = dateStr.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const utcMs = Date.UTC(year, month - 1, day);
  const dow = new Date(utcMs).getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysUntilSunday = (7 - dow) % 7;
  const sunday = new Date(utcMs + daysUntilSunday * MS_PER_DAY);
  return sunday.toISOString().slice(0, 10);
}

/**
 * Downsample daily portfolio points to Sunday-anchored weekly bars (taking the last point
 * in each Mon-Sun week), mirroring pandas.resample("W").last() for smooth chart rendering.
 */
export function resampleWeekly(points: PortfolioPoint[]): PortfolioPoint[] {
  if (points.length === 0) {
    return [];
  }

  const weekly: PortfolioPoint[] = [];
  let currentKey = "";

  for (const pt of points) {
    const key = sundayBucketKey(pt.date);
    if (key === currentKey && weekly.length > 0) {
      weekly[weekly.length - 1] = pt;
    } else {
      currentKey = key;
      weekly.push(pt);
    }
  }

  return weekly;
}
