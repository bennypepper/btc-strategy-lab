"use client";

import { useEffect, useState } from "react";
import type { ColumnarDataset, MarketDataResponse } from "@/lib/types";

export interface UseMarketDataResult {
  data: ColumnarDataset;
  isLive: boolean;
  isLoadingLive: boolean;
  lastDate: string;
}

/**
 * Hydrates synchronously from the SSR static snapshot and upgrades smoothly
 * once on mount from `/api/btc-data` with AbortController cleanup.
 */
export function useMarketData(
  initialData: ColumnarDataset
): UseMarketDataResult {
  const initialLastDate =
    initialData.dates[initialData.dates.length - 1] ?? "";

  const [data, setData] = useState<ColumnarDataset>(initialData);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(true);
  const [lastDate, setLastDate] = useState<string>(initialLastDate);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchLiveDelta(): Promise<void> {
      try {
        const res = await fetch("/api/btc-data", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          return;
        }
        const payload = (await res.json()) as MarketDataResponse;
        if (
          payload &&
          payload.data &&
          Array.isArray(payload.data.dates) &&
          payload.data.dates.length > 0
        ) {
          setData(payload.data);
          setIsLive(Boolean(payload.isLive));
          setLastDate(
            payload.lastDate ||
              (payload.data.dates[payload.data.dates.length - 1] ??
                initialLastDate)
          );
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        // Graceful degradation: keep SSR static snapshot when offline/unreachable
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingLive(false);
        }
      }
    }

    void fetchLiveDelta();

    return () => {
      controller.abort();
    };
  }, [initialLastDate]);

  return { data, isLive, isLoadingLive, lastDate };
}
