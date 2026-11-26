import { z } from "zod";

export const OBJECTIVE_KEYS = ["max_return", "min_drawdown", "max_sharpe"] as const;
export type ObjectiveKey = (typeof OBJECTIVE_KEYS)[number];

export interface ColumnarDataset {
  dates: string[];
  btc_open: number[];
  btc_close: number[];
  trolololo: (number | null)[];
}

export const BacktestParametersSchema = z
  .object({
    thresholdBuy: z.number().int().min(1).max(99),
    thresholdSell: z.number().int().min(2).max(100),
    allocBuyPct: z.number().finite().gt(0).lte(1),
    allocSellPct: z.number().finite().gt(0).lte(1),
    initialCash: z.number().finite().gt(0),
    feeRate: z.number().finite().min(0).max(0.1),
  })
  .refine((p) => p.thresholdBuy < p.thresholdSell, {
    message: "thresholdBuy must be strictly less than thresholdSell",
  });

export type BacktestParameters = z.infer<typeof BacktestParametersSchema>;

export interface StrategyMetrics {
  totalReturn: number;
  maxDrawdown: number;
  maxDrawdownDate: string;
  sharpeRatio: number;
  winRate: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  finalCash: number;
  finalBtc: number;
  finalPortfolioValue: number;
}

export interface BenchmarkMetrics {
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  finalValue: number;
}

export interface TradeRow {
  date: string;
  action: "BUY" | "SELL";
  btcPrice: number;
  amountUsd: number;
  btcAmount: number;
  signalIndex: number;
  cashAfter: number;
  btcHeldAfter: number;
  equityAfter: number;
}

export interface PortfolioPoint {
  date: string;
  portfolioValue: number;
  cash: number;
  btcHeld: number;
  btcClose: number;
  buyAndHoldValue: number;
}

export interface SimulationResult {
  portfolioHistory: PortfolioPoint[];
  tradeLog: TradeRow[];
  metrics: StrategyMetrics;
  benchmarkMetrics: BenchmarkMetrics;
  lowSampleWarning: boolean;
  params: BacktestParameters;
}

export interface ResearchObjectiveEntry {
  threshold_buy: number;
  threshold_sell: number;
  allocation_buy_pct: number;
  allocation_sell_pct: number;
  total_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  trade_count: number;
}

export interface DegradationEntry {
  return_degradation_pct: number;
  drawdown_degradation_pct: number;
  sharpe_degradation_pct: number;
  trade_count_oos: number;
  low_sample_warning: boolean;
}

export interface BenchmarkEntry {
  total_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
}

export interface ResearchSummary {
  metadata: {
    generated_at: string;
    total_trials_per_run: number;
  };
  scenario_1: {
    algorithm_used: string;
    in_sample: Record<ObjectiveKey, ResearchObjectiveEntry>;
    out_of_sample: Record<ObjectiveKey, ResearchObjectiveEntry>;
    degradation: Record<ObjectiveKey, DegradationEntry>;
  };
  scenario_2: {
    algorithm_used: string;
    disclosure: string;
    full_dataset: Record<ObjectiveKey, ResearchObjectiveEntry>;
  };
  buy_and_hold_benchmark: {
    in_sample: BenchmarkEntry;
    out_of_sample: BenchmarkEntry;
    full_dataset: BenchmarkEntry;
  };
}

export interface LiveObjectiveEntry {
  threshold_buy: number;
  threshold_sell: number;
  allocation_buy_pct: number;
  allocation_sell_pct: number;
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  trade_count: number;
}

export interface LiveOptimalParams {
  generated_at: string;
  status: string;
  total_combinations: number;
  elapsed_seconds: number;
  data_source: string;
  data_date_range: string;
  max_return: LiveObjectiveEntry;
  max_sharpe: LiveObjectiveEntry;
  min_drawdown: LiveObjectiveEntry;
  buy_and_hold: {
    total_return: number;
  };
}

export interface HeatmapMatrix {
  xLabels: number[];
  yLabels: number[];
  values: (number | null)[][];
}

export interface Top100Trial {
  threshold_buy: number;
  threshold_sell: number;
  allocation_buy_pct: number;
  allocation_sell_pct: number;
  total_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  trade_count: number;
}

export interface MarketDataResponse {
  isLive: boolean;
  lastDate: string;
  data: ColumnarDataset;
}

export const YahooChartResponseSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z
              .array(
                z.object({
                  open: z.array(z.number().nullable()).optional(),
                  close: z.array(z.number().nullable()).optional(),
                })
              )
              .min(1),
          }),
        })
      )
      .nullable(),
    error: z.unknown().nullable().optional(),
  }),
});
