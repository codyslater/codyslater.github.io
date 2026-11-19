import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { getPost, getPosts } from "@/lib/content";
import { mdxRemoteOptions } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx";
import { ThemeToggle } from "@/components/writing/ThemeToggle";
import { Toc } from "@/components/writing/Toc";
import { ReaderPills } from "@/components/writing/ReaderPills";
import { extractToc } from "@/lib/toc";
import { publicImageSize } from "@/lib/imageSize";
import { coverShareImage, pageMetadata } from "@/lib/metadata";
import { serif } from "@/lib/fonts-serif";
import "katex/dist/katex.min.css";

// A cover may ship a light-theme cut beside it: cover.webp -> cover-light.webp.
function lightCut(cover: string): string | null {
  const light = cover.replace(/(\.[a-z0-9]+)$/i, "-light$1");
  return light !== cover && existsSync(path.join(process.cwd(), "public", light)) ? light : null;
}

export function generateStaticParams() {
  // External posts live elsewhere and get no page here.
  const posts = getPosts().filter((post) => !post.external);
  if (posts.length === 0) return [{ slug: "__none__" }];
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "__none__") notFound();
  const post = getPost(slug);
  return pageMetadata({
    title: post.title,
    description: post.summary,
    path: `/writing/${slug}/`,
    image: coverShareImage(post.cover, post.title),
    type: "article",
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "__none__") notFound();
  const post = getPost(slug);
  const toc = post.toc ? extractToc(post.body) : [];
  const coverLight = post.cover ? lightCut(post.cover) : null;
  // width/height reserve the cover's box (CSS keeps it fluid) so the text below does not jump
  const coverSize = post.cover ? publicImageSize(post.cover) : null;
  const coverLightSize = coverLight ? publicImageSize(coverLight) : null;

  return (
    <div
      className={`writing-literary reading min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <article className="max-w-2xl mx-auto">
        <p className="lit-date mb-6">
          <Link href="/writing/" className="lit-back">
            ← writing
          </Link>
        </p>
        {post.cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.cover}
              alt={post.title}
              width={coverSize?.width}
              height={coverSize?.height}
              className={`w-full mb-8 rounded-none${coverLight ? " lit-cover-dark" : ""}`}
            />
            {coverLight && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverLight}
                alt={post.title}
                width={coverLightSize?.width}
                height={coverLightSize?.height}
                loading="lazy"
                className="w-full mb-8 rounded-none lit-cover-light"
              />
            )}
          </>
        )}
        <header className="lit-header mb-10">
          <div className="lit-bar">
            <p className="lit-date">
              written {post.date}
              {post.updated && ` · updated ${post.updated}`}
            </p>
            <ThemeToggle />
          </div>
          <h1 className="lit-title text-balance mt-2">
            {post.title}
          </h1>
        </header>
        {toc.length > 0 && <Toc items={toc} />}
        <div className="prose-mono literary-prose">
          <MDXRemote
            source={post.body}
            options={mdxRemoteOptions}
            components={mdxComponents}
          />
        </div>
      </article>
      <ReaderPills hasToc={toc.length > 0} />
    </div>
  );
}
