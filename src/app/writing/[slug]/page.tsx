import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { getPost, getPosts } from "@/lib/content";
import { mdxRemoteOptions } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx";
import "katex/dist/katex.min.css";

export function generateStaticParams() {
  const posts = getPosts();
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
  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url: `/writing/${slug}/`,
    },
    twitter: {
      card: "summary",
      title: post.title,
      description: post.summary,
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "__none__") notFound();
  const post = getPost(slug);

  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <article className="max-w-2xl mx-auto">
        <header className="mb-10">
          <p className="font-mono text-xs text-muted">{post.date}</p>
          <h1 className="font-mono text-2xl font-bold text-foreground mt-2">
            {post.title}
          </h1>
        </header>
        <div className="prose-mono">
          <MDXRemote
            source={post.body}
            options={mdxRemoteOptions}
            components={mdxComponents}
          />
        </div>
      </article>
    </div>
  );
}
