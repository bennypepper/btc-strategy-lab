import { HomeClient } from "@/components/home/HomeClient";
import { loadMasterDataset, loadResearchSummary } from "@/lib/server-data";

export default async function HomePage() {
  const [initialData, research] = await Promise.all([
    loadMasterDataset(),
    loadResearchSummary(),
  ]);

  return <HomeClient initialData={initialData} research={research} />;
}
