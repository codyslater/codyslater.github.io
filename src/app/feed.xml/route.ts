import { getPosts } from "@/lib/content";
import { siteConfig } from "@/lib/constants";

export const dynamic = "force-static";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function GET() {
  const items = getPosts()
    .map((post) => {
      const url = `${siteConfig.url}/writing/${post.slug}/`;
      return [
        "<item>",
        `<title>${esc(post.title)}</title>`,
        `<link>${url}</link>`,
        `<guid>${url}</guid>`,
        `<pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>`,
        `<description>${esc(post.summary)}</description>`,
        "</item>",
      ].join("");
    })
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0"><channel>` +
    `<title>${esc(siteConfig.name)} · writing</title>` +
    `<link>${siteConfig.url}/writing/</link>` +
    `<description>${esc(siteConfig.description)}</description>` +
    items +
    `</channel></rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
