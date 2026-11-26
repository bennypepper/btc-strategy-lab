import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resampleWeekly, runBacktestFull, sliceDataset } from "../engine";
import type { ColumnarDataset, PortfolioPoint } from "../types";
import goldenParity from "../__fixtures__/golden_parity.json";

const masterDatasetPath = path.resolve(
  __dirname,
  "../../../public/data/master_dataset.json"
);
const masterDataset = JSON.parse(
  fs.readFileSync(masterDatasetPath, "utf-8")
) as ColumnarDataset;

describe("engine golden Python parity", () => {
  for (const scenario of goldenParity.scenarios) {
    it(`matches Python engine within 1e-10 for scenario: ${scenario.spec.name}`, () => {
      const sliced = sliceDataset(
        masterDataset,
        scenario.spec.start,
        scenario.spec.end
      );
      const result = runBacktestFull(sliced, {
        thresholdBuy: scenario.spec.thresholdBuy,
        thresholdSell: scenario.spec.thresholdSell,
        allocBuyPct: scenario.spec.allocBuyPct,
        allocSellPct: scenario.spec.allocSellPct,
        initialCash: scenario.spec.initialCash,
        feeRate: scenario.spec.feeRate,
      });

      expect(result.portfolioHistory.length).toBe(scenario.historyLength);
      expect(result.lowSampleWarning).toBe(scenario.lowSampleWarning);

      // Strategy metrics parity
      expect(
        Math.abs(result.metrics.totalReturn - scenario.metrics.totalReturn)
      ).toBeLessThanOrEqual(1e-10 * Math.max(1, Math.abs(scenario.metrics.totalReturn)));
      expect(
        Math.abs(result.metrics.maxDrawdown - scenario.metrics.maxDrawdown)
      ).toBeLessThanOrEqual(1e-10);
      expect(result.metrics.maxDrawdownDate).toBe(
        scenario.metrics.maxDrawdownDate
      );
      expect(
        Math.abs(result.metrics.sharpeRatio - scenario.metrics.sharpeRatio)
      ).toBeLessThanOrEqual(1e-10);
      expect(
        Math.abs(result.metrics.winRate - scenario.metrics.winRate)
      ).toBeLessThanOrEqual(1e-10);
      expect(result.metrics.tradeCount).toBe(scenario.metrics.tradeCount);
      expect(result.metrics.buyCount).toBe(scenario.metrics.buyCount);
      expect(result.metrics.sellCount).toBe(scenario.metrics.sellCount);
      expect(
        Math.abs(result.metrics.finalCash - scenario.metrics.finalCash)
      ).toBeLessThanOrEqual(1e-10 * Math.max(1, Math.abs(scenario.metrics.finalCash)));
      expect(
        Math.abs(result.metrics.finalBtc - scenario.metrics.finalBtc)
      ).toBeLessThanOrEqual(1e-10 * Math.max(1, Math.abs(scenario.metrics.finalBtc)));
      expect(
        Math.abs(
          result.metrics.finalPortfolioValue -
            scenario.metrics.finalPortfolioValue
        )
      ).toBeLessThanOrEqual(
        1e-10 * Math.max(1, Math.abs(scenario.metrics.finalPortfolioValue))
      );

      // Benchmark metrics parity
      expect(
        Math.abs(
          result.benchmarkMetrics.totalReturn -
            scenario.benchmarkMetrics.totalReturn
        )
      ).toBeLessThanOrEqual(
        1e-10 * Math.max(1, Math.abs(scenario.benchmarkMetrics.totalReturn))
      );
      expect(
        Math.abs(
          result.benchmarkMetrics.maxDrawdown -
            scenario.benchmarkMetrics.maxDrawdown
        )
      ).toBeLessThanOrEqual(1e-10);
      expect(
        Math.abs(
          result.benchmarkMetrics.sharpeRatio -
            scenario.benchmarkMetrics.sharpeRatio
        )
      ).toBeLessThanOrEqual(1e-10);
      expect(
        Math.abs(
          result.benchmarkMetrics.finalValue -
            scenario.benchmarkMetrics.finalValue
        )
      ).toBeLessThanOrEqual(
        1e-10 * Math.max(1, Math.abs(scenario.benchmarkMetrics.finalValue))
      );

      // First and last trade parity
      expect(result.tradeLog.length).toBe(scenario.metrics.tradeCount);
      const firstTrade = result.tradeLog[0];
      const lastTrade = result.tradeLog[result.tradeLog.length - 1];
      expect(firstTrade).toBeDefined();
      expect(lastTrade).toBeDefined();
      expect(firstTrade?.date).toBe(scenario.firstTrade.date);
      expect(firstTrade?.action).toBe(scenario.firstTrade.action);
      expect(firstTrade?.btcPrice).toBe(scenario.firstTrade.btcPrice);
      expect(firstTrade?.amountUsd).toBe(scenario.firstTrade.amountUsd);
      expect(firstTrade?.btcAmount).toBe(scenario.firstTrade.btcAmount);
      expect(firstTrade?.signalIndex).toBe(scenario.firstTrade.signalIndex);

      expect(lastTrade?.date).toBe(scenario.lastTrade.date);
      expect(lastTrade?.action).toBe(scenario.lastTrade.action);
      expect(lastTrade?.btcPrice).toBe(scenario.lastTrade.btcPrice);
      expect(lastTrade?.amountUsd).toBe(scenario.lastTrade.amountUsd);
      expect(lastTrade?.btcAmount).toBe(scenario.lastTrade.btcAmount);
      expect(lastTrade?.signalIndex).toBe(scenario.lastTrade.signalIndex);
    });
  }
});

describe("engine edge cases & validation", () => {
  it("enforces T+1 execution, dust guards, and lowSampleWarning", () => {
    const dataset: ColumnarDataset = {
      dates: ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"],
      btc_open: [100, 110, 200, 250],
      btc_close: [105, 195, 240, 260],
      trolololo: [10, 85, 50, 50],
    };

    const result = runBacktestFull(dataset, {
      thresholdBuy: 20,
      thresholdSell: 80,
      allocBuyPct: 0.5,
      allocSellPct: 0.5,
      initialCash: 1000,
      feeRate: 0.001,
    });

    // Day 0 signal=10 -> BUY at Day 1 open (110)
    // Day 1 signal=85 -> SELL at Day 2 open (200)
    expect(result.tradeLog.length).toBe(2);
    expect(result.tradeLog[0]?.date).toBe("2024-01-02");
    expect(result.tradeLog[0]?.action).toBe("BUY");
    expect(result.tradeLog[0]?.btcPrice).toBe(110);
    expect(result.tradeLog[1]?.date).toBe("2024-01-03");
    expect(result.tradeLog[1]?.action).toBe("SELL");
    expect(result.tradeLog[1]?.btcPrice).toBe(200);
    expect(result.metrics.winRate).toBe(1);
    expect(result.lowSampleWarning).toBe(true);
  });

  it("blocks dust buys <= $1.0 and dust sells <= 0.000001 BTC", () => {
    const dataset: ColumnarDataset = {
      dates: ["2024-01-01", "2024-01-02", "2024-01-03"],
      btc_open: [100_000, 100_000, 100_000],
      btc_close: [100_000, 100_000, 100_000],
      trolololo: [5, 95, 50],
    };

    const result = runBacktestFull(dataset, {
      thresholdBuy: 20,
      thresholdSell: 80,
      allocBuyPct: 0.5,
      allocSellPct: 0.5,
      initialCash: 2.0, // 2.0 * 0.5 = 1.0 (not > 1.0 -> blocked!)
      feeRate: 0,
    });

    expect(result.tradeLog.length).toBe(0);
    expect(result.metrics.tradeCount).toBe(0);
  });

  it("rejects invalid parameters, fewer than 2 valid rows, and non-positive prices", () => {
    const validDataset: ColumnarDataset = {
      dates: ["2024-01-01", "2024-01-02"],
      btc_open: [100, 110],
      btc_close: [105, 115],
      trolololo: [10, 50],
    };

    // thresholdBuy >= thresholdSell
    expect(() =>
      runBacktestFull(validDataset, {
        thresholdBuy: 50,
        thresholdSell: 50,
        allocBuyPct: 0.1,
        allocSellPct: 0.1,
        initialCash: 1000,
        feeRate: 0.001,
      })
    ).toThrow();

    // < 2 valid rows (one null trolololo)
    expect(() =>
      runBacktestFull(
        {
          dates: ["2024-01-01", "2024-01-02"],
          btc_open: [100, 110],
          btc_close: [105, 115],
          trolololo: [null, 50],
        },
        {
          thresholdBuy: 20,
          thresholdSell: 80,
          allocBuyPct: 0.1,
          allocSellPct: 0.1,
          initialCash: 1000,
          feeRate: 0.001,
        }
      )
    ).toThrow(/Insufficient/i);

    // non-positive price
    expect(() =>
      runBacktestFull(
        {
          dates: ["2024-01-01", "2024-01-02"],
          btc_open: [100, 0],
          btc_close: [105, 115],
          trolololo: [10, 50],
        },
        {
          thresholdBuy: 20,
          thresholdSell: 80,
          allocBuyPct: 0.1,
          allocSellPct: 0.1,
          initialCash: 1000,
          feeRate: 0.001,
        }
      )
    ).toThrow();
  });
});

describe("resampleWeekly", () => {
  it("groups daily points by Sunday-anchored week and takes the last point in each week", () => {
    // 2024-01-05 = Fri, 2024-01-06 = Sat, 2024-01-07 = Sun (Week 1 ends 2024-01-07)
    // 2024-01-08 = Mon, 2024-01-10 = Wed (Week 2 ends 2024-01-14)
    const makePoint = (date: string, val: number): PortfolioPoint => ({
      date,
      portfolioValue: val,
      cash: val,
      btcHeld: 0,
      btcClose: 100,
      buyAndHoldValue: val,
    });

    const daily = [
      makePoint("2024-01-05", 100),
      makePoint("2024-01-06", 110),
      makePoint("2024-01-07", 120),
      makePoint("2024-01-08", 130),
      makePoint("2024-01-10", 140),
    ];

    const weekly = resampleWeekly(daily);
    expect(weekly.length).toBe(2);
    expect(weekly[0]?.date).toBe("2024-01-07");
    expect(weekly[0]?.portfolioValue).toBe(120);
    expect(weekly[1]?.date).toBe("2024-01-10");
    expect(weekly[1]?.portfolioValue).toBe(140);
  });

  it("returns empty array for empty input", () => {
    expect(resampleWeekly([])).toEqual([]);
  });
});
