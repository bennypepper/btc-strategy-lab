import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOTTOM_OFFSET,
  BOTTOM_SLOPE,
  CONFIRMED_HIGHS,
  CONFIRMED_LOWS,
  FIRST_HIGH_CORRECTION,
  INTERCEPT,
  ORIGIN_DATE,
  TOP_OFFSET,
  TOP_SLOPE,
  computeTrolololo,
  computeTrolololoBands,
  daysSinceOrigin,
} from "../trolololo";
import type { ColumnarDataset } from "../types";
import goldenParity from "../__fixtures__/golden_parity.json";

const masterDatasetPath = path.resolve(
  __dirname,
  "../../../public/data/master_dataset.json"
);
const masterDataset = JSON.parse(
  fs.readFileSync(masterDatasetPath, "utf-8")
) as ColumnarDataset;

describe("trolololo constants & daysSinceOrigin", () => {
  it("exports canonical constants matching core/trolololo.py", () => {
    expect(ORIGIN_DATE).toBe("2012-01-01");
    expect(TOP_SLOPE).toBe(2.9);
    expect(TOP_OFFSET).toBe(1400);
    expect(BOTTOM_SLOPE).toBe(2.788);
    expect(BOTTOM_OFFSET).toBe(1200);
    expect(INTERCEPT).toBe(19.463);
    expect(FIRST_HIGH_CORRECTION).toBe(0.6);
    expect(CONFIRMED_HIGHS).toEqual([
      "2013-04-09",
      "2013-11-30",
      "2017-12-17",
      "2021-11-10",
    ]);
    expect(CONFIRMED_LOWS).toEqual([
      "2012-11-18",
      "2015-01-14",
      "2018-12-15",
      "2022-11-21",
    ]);
  });

  it("computes exact UTC calendar days since 2012-01-01 without DST drift", () => {
    expect(daysSinceOrigin("2012-01-01")).toBe(0);
    expect(daysSinceOrigin("2012-01-02")).toBe(1);
    expect(daysSinceOrigin("2012-03-01")).toBe(60); // 2012 is a leap year
    expect(daysSinceOrigin("2013-01-01")).toBe(366);
    expect(daysSinceOrigin("2026-03-15")).toBe(5187);
  });
});

describe("trolololo golden Python parity", () => {
  it("matches Python compute_trolololo and compute_trolololo_bands within 1e-10 on all golden samples", () => {
    expect(masterDataset.dates.length).toBe(goldenParity.datasetRowCount);

    const trolololo = computeTrolololo(
      masterDataset.dates,
      masterDataset.btc_close
    );
    const { topBand, bottomBand } = computeTrolololoBands(
      masterDataset.dates,
      masterDataset.btc_close
    );

    expect(trolololo.length).toBe(masterDataset.dates.length);
    expect(topBand.length).toBe(masterDataset.dates.length);
    expect(bottomBand.length).toBe(masterDataset.dates.length);

    for (const sample of goldenParity.trolololoSamples) {
      expect(masterDataset.dates[sample.index]).toBe(sample.date);

      if (sample.trolololo === null) {
        expect(trolololo[sample.index]).toBeNull();
        expect(topBand[sample.index]).toBeNull();
        expect(bottomBand[sample.index]).toBeNull();
      } else {
        const computedVal = trolololo[sample.index];
        const computedTop = topBand[sample.index];
        const computedBottom = bottomBand[sample.index];

        expect(computedVal).not.toBeNull();
        expect(computedTop).not.toBeNull();
        expect(computedBottom).not.toBeNull();

        expect(Math.abs((computedVal as number) - sample.trolololo)).toBeLessThanOrEqual(
          1e-10
        );
        expect(Math.abs((computedTop as number) - (sample.topBand as number))).toBeLessThanOrEqual(
          1e-10
        );
        expect(
          Math.abs((computedBottom as number) - (sample.bottomBand as number))
        ).toBeLessThanOrEqual(1e-10);
      }
    }
  });

  it("produces 0.0 retroactive shift on historical dates when appending post-2026 live bars", () => {
    const baseTrolololo = computeTrolololo(
      masterDataset.dates,
      masterDataset.btc_close
    );

    const extendedDates = [
      ...masterDataset.dates,
      "2026-03-16",
      "2026-03-17",
      "2026-03-18",
      "2027-01-01",
    ];
    const extendedClose = [
      ...masterDataset.btc_close,
      95_000,
      140_000,
      45_000,
      250_000,
    ];

    const extendedTrolololo = computeTrolololo(extendedDates, extendedClose);
    expect(extendedTrolololo.length).toBe(extendedDates.length);

    for (let i = 0; i < baseTrolololo.length; i++) {
      expect(extendedTrolololo[i]).toBe(baseTrolololo[i]);
    }

    for (let i = baseTrolololo.length; i < extendedTrolololo.length; i++) {
      const val = extendedTrolololo[i];
      expect(val).not.toBeNull();
      expect(val as number).toBeGreaterThanOrEqual(0);
      expect(val as number).toBeLessThanOrEqual(100);
    }
  });

  it("throws on insufficient valid rows or mismatched array lengths", () => {
    expect(() =>
      computeTrolololo(["2012-01-02", "2012-01-03"], [5.0])
    ).toThrow();
    expect(() =>
      computeTrolololo(
        ["2012-01-01", "2012-01-02", "2012-01-03"],
        [5.0, 5.1, 5.2]
      )
    ).toThrow(/Insufficient valid data points/i);
  });
});
