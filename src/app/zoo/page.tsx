import type { Metadata } from "next";
import { ZooClient } from "@/components/zoo/ZooClient";

// Hidden page: never linked, absent from sitemap.ts, and noindexed.
// Discovery is the undocumented `zoo` terminal command only.
export const metadata: Metadata = {
  title: "zoo",
  description: "specimen collection",
  robots: { index: false, follow: false },
};

export default function ZooPage() {
  return <ZooClient />;
}
