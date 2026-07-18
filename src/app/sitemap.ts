import type { MetadataRoute } from "next";
import { getPosts } from "@/lib/content";
import { siteConfig } from "@/lib/constants";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Pages are enumerated explicitly; hidden pages (/zoo, /soup) must stay unlisted.
  const pages = ["", "/about/", "/writing/", "/projects/", "/graph/"].map(
    (p) => ({ url: `${siteConfig.url}${p}` }),
  );
  const posts = getPosts().map((post) => ({
    url: `${siteConfig.url}/writing/${post.slug}/`,
    lastModified: post.date,
  }));
  return [...pages, ...posts];
}
