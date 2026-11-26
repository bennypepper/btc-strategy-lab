import type { Metadata } from "next";
import { DocsClient } from "@/components/docs/DocsClient";

export const metadata: Metadata = {
  title: "Documentation · BTC Strategy Lab",
  description:
    "On-chain indicator definitions, T+1 strategy execution logic, metric glossary, 4-phase research methodology, and limitations.",
};

export default function DocsPage() {
  return <DocsClient />;
}
