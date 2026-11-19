import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { ogImage, siteConfig } from "@/lib/constants";

export type ShareImage = { url: string; width: number; height: number; alt: string };

// A page-level share-card object (Open Graph or the X card) replaces the layout's whole object
// (Next merges only the top-level keys), so every page states its own full set; this builds it once.
// `title` is the bare page title: the tab template ("%s · cody_slater") is applied by the
// layout, and the share title gets the site name instead.
export function pageMetadata({
  title,
  description,
  path: pagePath,
  image,
  type = "website",
  robots,
}: {
  title: string;
  description: string;
  path: string; // site path with the trailing slash, e.g. "/about/"
  image?: ShareImage;
  type?: "website" | "article";
  robots?: Metadata["robots"];
}): Metadata {
  const url = `${siteConfig.url}${pagePath}`;
  const shareTitle = `${title} · ${siteConfig.name}`;
  const img = image ?? ogImage;
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    alternates: {
      canonical: url,
      // the layout's feed link, repeated because `alternates` is replaced, not merged
      types: { "application/rss+xml": "/feed.xml" },
    },
    openGraph: { title: shareTitle, description, url, siteName: siteConfig.name, type, images: [img] },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [img] },
  };
}

// The 1200x630 share card scripts/make-og-images.py writes beside a cover, if it exists.
export function coverShareImage(cover: string | undefined, alt: string): ShareImage | undefined {
  if (!cover) return undefined;
  const url = path.posix.join(path.posix.dirname(cover), "og.jpg");
  if (!existsSync(path.join(process.cwd(), "public", url))) return undefined;
  return { url, width: 1200, height: 630, alt };
}
