import type { Metadata } from "next";
import { Suspense } from "react";
import { SoupClient } from "@/components/soup/SoupClient";
import { pageMetadata } from "@/lib/metadata";

// Hidden page: never linked, absent from sitemap.ts, and noindexed.
// Discovery is clicking the home page creature only.
export const metadata: Metadata = pageMetadata({
  title: "soup",
  description: "primordial soup",
  path: "/soup/",
  robots: { index: false, follow: false },
});

export default function SoupPage() {
  return (
    <Suspense>
      <SoupClient />
    </Suspense>
  );
}
