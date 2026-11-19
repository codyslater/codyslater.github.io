import type { MetadataRoute } from "next";
import { getPosts, getProjects } from "@/lib/content";
import { siteConfig } from "@/lib/constants";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Pages are enumerated explicitly; hidden pages (/zoo, /soup) must stay unlisted,
  // and /graph is a bare canvas with no content to index.
  const pages = ["", "/about/", "/writing/", "/projects/", "/cv/", "/publications/"].map(
    (p) => ({ url: `${siteConfig.url}${p}` }),
  );
  const posts = getPosts()
    .filter((post) => !post.external)
    .map((post) => ({
    url: `${siteConfig.url}/writing/${post.slug}/`,
    lastModified: post.updated ?? post.date,
  }));
  // getProjects() drops drafts in production, the same filter the pages themselves use.
  const projects = getProjects().map((project) => ({
    url: `${siteConfig.url}/projects/${project.slug}/`,
  }));
  return [...pages, ...posts, ...projects];
}
