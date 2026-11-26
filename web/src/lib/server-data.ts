import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ColumnarDataset,
  HeatmapMatrix,
  LiveOptimalParams,
  ResearchSummary,
  Top100Trial,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

async function readJsonArtifact<T>(filename: string): Promise<T> {
  const filePath = path.join(DATA_DIR, filename);
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadMasterDataset(): Promise<ColumnarDataset> {
  return readJsonArtifact<ColumnarDataset>("master_dataset.json");
}

export async function loadResearchSummary(): Promise<ResearchSummary> {
  return readJsonArtifact<ResearchSummary>("optimal_params_summary.json");
}

export async function loadLiveOptimalParams(): Promise<LiveOptimalParams | null> {
  try {
    return await readJsonArtifact<LiveOptimalParams>("live_optimal_params.json");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

export async function loadHeatmapMatrix(
  scenario: 1 | 2
): Promise<HeatmapMatrix> {
  const filename =
    scenario === 1
      ? "s1_heatmap_total_return.json"
      : "s2_heatmap_total_return.json";
  return readJsonArtifact<HeatmapMatrix>(filename);
}

export async function loadTop100Trials(
  scenario: 1 | 2
): Promise<Top100Trial[]> {
  const filename =
    scenario === 1 ? "s1_top100_max_return.json" : "s2_top100_max_return.json";
  return readJsonArtifact<Top100Trial[]>(filename);
}
