import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { getPost, getPosts } from "@/lib/content";
import { mdxRemoteOptions } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx";
import { ThemeToggle } from "@/components/writing/ThemeToggle";
import { ThemeScript } from "@/components/writing/ThemeScript";
import { serif } from "@/lib/fonts";
import "katex/dist/katex.min.css";

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
  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url: `/writing/${slug}/`,
      ...(post.cover ? { images: [post.cover] } : {}),
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
    <div
      className={`writing-literary reading min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <ThemeScript />
      <article className="max-w-2xl mx-auto">
        {post.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover}
            alt={post.title}
            className="w-full mb-8 rounded-none"
          />
        )}
        <header className="lit-header mb-10">
          <div className="lit-bar">
            <p className="lit-date">
              written {post.date}
              {post.updated && ` · updated ${post.updated}`}
            </p>
            <ThemeToggle />
          </div>
          <h1 className="lit-title mt-2">
            {post.title}
          </h1>
        </header>
        <div className="prose-mono literary-prose">
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
