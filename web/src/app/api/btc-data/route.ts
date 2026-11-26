import { NextResponse } from "next/server";
import { mergeLiveDelta, parseYahooChartBars } from "@/lib/market-data";
import { loadMasterDataset } from "@/lib/server-data";
import type { MarketDataResponse } from "@/lib/types";

export const revalidate = 300;

const YAHOO_TIMEOUT_MS = 8000;
const CACHE_CONTROL_HEADER =
  "public, s-maxage=300, stale-while-revalidate=600";

function nextDayUnixSeconds(isoDate: string): number {
  const parts = isoDate.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return Math.floor(Date.UTC(year, month - 1, day + 1) / 1000);
}

export async function GET(): Promise<NextResponse<MarketDataResponse>> {
  const staticData = await loadMasterDataset();
  const staticLastDate =
    staticData.dates[staticData.dates.length - 1] ?? "2026-03-15";

  const fallbackResponse = (): NextResponse<MarketDataResponse> =>
    NextResponse.json<MarketDataResponse>(
      {
        isLive: false,
        lastDate: staticLastDate,
        data: staticData,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": CACHE_CONTROL_HEADER,
        },
      }
    );

  const period1 = nextDayUnixSeconds(staticLastDate);
  const period2 = Math.floor(Date.now() / 1000);
  if (period1 >= period2) {
    return fallbackResponse();
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?period1=${period1}&period2=${period2}&interval=1d`;

  try {
    const response = await fetch(yahooUrl, {
      signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS),
      headers: {
        "User-Agent": "btc-strategy-lab/2.0 (+https://btc-strategy-lab.vercel.app)",
        Accept: "application/json",
      },
      next: { revalidate },
    });

    if (!response.ok) {
      console.warn(
        JSON.stringify({
          event: "yahoo_finance_http_error",
          status: response.status,
          staticLastDate,
        })
      );
      return fallbackResponse();
    }

    const rawJson: unknown = await response.json();
    const delta = parseYahooChartBars(rawJson);

    if (delta.dates.length === 0) {
      console.warn(
        JSON.stringify({
          event: "yahoo_finance_empty_delta",
          staticLastDate,
        })
      );
      return fallbackResponse();
    }

    const merged = mergeLiveDelta(staticData, delta);
    const lastDate = merged.dates[merged.dates.length - 1] ?? staticLastDate;

    return NextResponse.json<MarketDataResponse>(
      {
        isLive: true,
        lastDate,
        data: merged,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": CACHE_CONTROL_HEADER,
        },
      }
    );
  } catch (err: unknown) {
    console.warn(
      JSON.stringify({
        event: "yahoo_finance_fetch_failed",
        reason: err instanceof Error ? err.message : "unknown_error",
        staticLastDate,
      })
    );
    return fallbackResponse();
  }
}
