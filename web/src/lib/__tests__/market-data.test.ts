import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toCsv } from "../csv";
import { mergeLiveDelta, parseYahooChartBars } from "../market-data";
import { computeTrolololo } from "../trolololo";
import { GET } from "../../app/api/btc-data/route";
import type { ColumnarDataset, MarketDataResponse } from "../types";

const masterDatasetPath = path.resolve(
  __dirname,
  "../../../public/data/master_dataset.json"
);
const masterDataset = JSON.parse(
  fs.readFileSync(masterDatasetPath, "utf-8")
) as ColumnarDataset;

describe("parseYahooChartBars", () => {
  it("parses valid Yahoo Finance v8 chart payload into UTC YYYY-MM-DD bars and drops invalid rows", () => {
    const raw = {
      chart: {
        result: [
          {
            timestamp: [
              Date.UTC(2026, 2, 16) / 1000,
              Date.UTC(2026, 2, 17) / 1000,
              Date.UTC(2026, 2, 18) / 1000,
              Date.UTC(2026, 2, 19) / 1000,
            ],
            indicators: {
              quote: [
                {
                  open: [85000, null, -100, 87000],
                  close: [86000, 86500, 86800, 0],
                },
              ],
            },
          },
        ],
        error: null,
      },
    };

    const parsed = parseYahooChartBars(raw);
    expect(parsed.dates).toEqual(["2026-03-16"]);
    expect(parsed.btc_open).toEqual([85000]);
    expect(parsed.btc_close).toEqual([86000]);
  });

  it("throws on malformed Yahoo payload", () => {
    expect(() => parseYahooChartBars({ bad: true })).toThrow();
    expect(() =>
      parseYahooChartBars({ chart: { result: null, error: { code: "Not Found" } } })
    ).toThrow();
  });
});

describe("mergeLiveDelta", () => {
  it("deduplicates keep=last, sorts ascending, filters invalid prices, and preserves historical trolololo", () => {
    const lastStaticIdx = masterDataset.dates.length - 1;
    const lastStaticDate = masterDataset.dates[lastStaticIdx] as string;

    const merged = mergeLiveDelta(masterDataset, {
      dates: ["2026-03-18", lastStaticDate, "2026-03-17", "2026-03-19"],
      btc_open: [91000, 84500, 90000, -5],
      btc_close: [92000, 85500, 91000, 93000],
    });

    // 2026-03-19 dropped due to negative open; lastStaticDate updated in place; 17 & 18 appended sorted
    expect(merged.dates.length).toBe(masterDataset.dates.length + 2);
    expect(merged.dates[lastStaticIdx]).toBe(lastStaticDate);
    expect(merged.btc_close[lastStaticIdx]).toBe(85500);
    expect(merged.dates[lastStaticIdx + 1]).toBe("2026-03-17");
    expect(merged.dates[lastStaticIdx + 2]).toBe("2026-03-18");

    // Historical trolololo before lastStaticDate is strictly unchanged (0.0 shift vs baseline computeTrolololo)
    const baseTrolololo = computeTrolololo(
      masterDataset.dates,
      masterDataset.btc_close
    );
    for (let i = 0; i < lastStaticIdx; i++) {
      expect(merged.trolololo[i]).toBe(baseTrolololo[i]);
    }
    expect(merged.trolololo[lastStaticIdx + 1]).not.toBeNull();
    expect(merged.trolololo[lastStaticIdx + 2]).not.toBeNull();
  });
});

describe("toCsv", () => {
  it("formats RFC 4180 CSV and neutralizes formula injection on string cells without altering negative numbers", () => {
    const csv = toCsv([
      {
        label: '=CMD|" /C calc"!A0',
        note: 'hello, "world"',
        delta: -42.5,
        formulaPlus: "+SUM(A1:A2)",
        formulaAt: "@evil",
        formulaMinus: "-1+1",
      },
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("label,note,delta,formulaPlus,formulaAt,formulaMinus");
    expect(lines[1]).toBe(
      `"'=CMD|"" /C calc""!A0","hello, ""world""",-42.5,'+SUM(A1:A2),'@evil,'-1+1`
    );
  });
});

describe("GET /api/btc-data", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns HTTP 200 with isLive=true and Cache-Control when Yahoo Finance returns valid bars", async () => {
    const mockPayload = {
      chart: {
        result: [
          {
            timestamp: [Date.UTC(2026, 2, 16) / 1000],
            indicators: {
              quote: [
                {
                  open: [85000],
                  close: [86000],
                },
              ],
            },
          },
        ],
        error: null,
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=600"
    );

    const body = (await res.json()) as MarketDataResponse;
    expect(body.isLive).toBe(true);
    expect(body.lastDate).toBe("2026-03-16");
    expect(body.data.dates.length).toBe(masterDataset.dates.length + 1);
  });

  it("gracefully falls back to static snapshot with HTTP 200 and isLive=false when upstream fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("upstream timeout")
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as MarketDataResponse;
    expect(body.isLive).toBe(false);
    expect(body.lastDate).toBe(
      masterDataset.dates[masterDataset.dates.length - 1]
    );
    expect(body.data.dates.length).toBe(masterDataset.dates.length);
    expect(warnSpy).toHaveBeenCalled();
  });
});
