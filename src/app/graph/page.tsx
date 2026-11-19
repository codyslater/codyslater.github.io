import type { Metadata } from "next";
import { GraphPageClient } from "@/components/ui/GraphPageClient";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "graph",
  description: "an interactive network of nodes that fire signals along their edges as you hover.",
  path: "/graph/",
});

export default function GraphPage() {
  return <GraphPageClient />;
}
