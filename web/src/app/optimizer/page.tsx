import type { Metadata } from "next";
import { OptimizerClient } from "@/components/optimizer/OptimizerClient";
import { loadLiveOptimalParams } from "@/lib/server-data";

export const metadata: Metadata = {
  title: "Live Optimizer · BTC Strategy Lab",
  description:
    "Latest live-aligned optimal strategy parameters from the 1,293,750-combination Numba grid search with direct Simulator deep-links.",
};

export default async function OptimizerPage() {
  const liveParams = await loadLiveOptimalParams();
  return <OptimizerClient liveParams={liveParams} />;
}
