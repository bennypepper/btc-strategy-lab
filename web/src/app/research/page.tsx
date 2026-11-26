import type { Metadata } from "next";
import { ResearchClient } from "@/components/research/ResearchClient";
import {
  loadHeatmapMatrix,
  loadMasterDataset,
  loadResearchSummary,
  loadTop100Trials,
} from "@/lib/server-data";

export const metadata: Metadata = {
  title: "Research Results · BTC Strategy Lab",
  description:
    "Phase 3 optimization outcomes across 1,293,750 trials per scenario, In-Sample vs Out-of-Sample validation, degradation metrics, and parameter sensitivity heatmaps.",
};

export default async function ResearchPage() {
  const [results, masterDataset, s1Heatmap, s2Heatmap, s1Top100, s2Top100] =
    await Promise.all([
      loadResearchSummary(),
      loadMasterDataset(),
      loadHeatmapMatrix(1),
      loadHeatmapMatrix(2),
      loadTop100Trials(1),
      loadTop100Trials(2),
    ]);

  return (
    <ResearchClient
      results={results}
      masterDataset={masterDataset}
      s1Heatmap={s1Heatmap}
      s2Heatmap={s2Heatmap}
      s1Top100={s1Top100}
      s2Top100={s2Top100}
    />
  );
}
