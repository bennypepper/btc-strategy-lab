import { Suspense } from "react";
import { SimulatorClient } from "@/components/simulator/SimulatorClient";
import {
  loadLiveOptimalParams,
  loadMasterDataset,
  loadResearchSummary,
} from "@/lib/server-data";

function SimulatorLoadingFallback() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">⚡ Strategy Simulator</h1>
        <p className="page-subtitle mt-1.5">
          Loading historical dataset and simulation engine…
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="brutal-card-static h-[520px] p-6 lg:col-span-5" />
        <div className="brutal-card-static h-[520px] p-6 lg:col-span-7" />
      </div>
    </div>
  );
}

export default async function SimulatorPage() {
  const [initialData, research, liveParams] = await Promise.all([
    loadMasterDataset(),
    loadResearchSummary(),
    loadLiveOptimalParams(),
  ]);

  return (
    <Suspense fallback={<SimulatorLoadingFallback />}>
      <SimulatorClient
        initialData={initialData}
        research={research}
        liveParams={liveParams}
      />
    </Suspense>
  );
}
