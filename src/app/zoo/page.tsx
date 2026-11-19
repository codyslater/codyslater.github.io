import type { Metadata } from "next";
import { ZooClient } from "@/components/zoo/ZooClient";
import { pageMetadata } from "@/lib/metadata";

// Hidden page: never linked, absent from sitemap.ts, and noindexed.
// Discovery is the undocumented `zoo` terminal command only.
export const metadata: Metadata = pageMetadata({
  title: "zoo",
  description: "specimen collection",
  path: "/zoo/",
  robots: { index: false, follow: false },
});

export default function ZooPage() {
  return <ZooClient />;
}
