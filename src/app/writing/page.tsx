import type { Metadata } from "next";
import Link from "next/link";
import { FadeIn } from "@/components/ui/FadeIn";
import { serif } from "@/lib/fonts-serif";
import { getPosts } from "@/lib/content";
import { indexCover } from "@/lib/imageSize";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "writing",
  description: "Essays and notes by Cody Slater.",
  path: "/writing/",
});

export default function WritingPage() {
  const posts = getPosts();

  return (
    <div
      className={`writing-literary min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="lit-bar mb-10">
            <h1 className="lit-heading">writing</h1>
          </div>
        </FadeIn>

        {posts.length === 0 ? (
          <FadeIn delay={0.1}>
            <div className="font-mono text-sm text-muted space-y-1">
              <p>
                <span className="text-accent-green">$</span> ls writing/
              </p>
              <p>nothing here yet — first post coming soon.</p>
            </div>
          </FadeIn>
        ) : (
          <ul className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
            {posts.map((post, i) => {
              const thumb = post.cover ? indexCover(post.cover) : null;
              return (
              <li key={post.slug}>
                <FadeIn delay={0.1 + 0.05 * i}>
                  <Link
                    href={post.external ?? `/writing/${post.slug}/`}
                    className="lit-card"
                    {...(post.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {post.cover && thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb.src}
                        width={thumb.width}
                        height={thumb.height}
                        alt=""
                        loading={i < 2 ? "eager" : "lazy"}
                        fetchPriority={i === 0 ? "high" : undefined}
                        decoding="async"
                        className="lit-cover"
                      />
                    ) : (
                      <div className="lit-cover lit-cover-fallback">
                        {post.tags[0] && (
                          <span className="lit-corner">{post.tags[0]}</span>
                        )}
                        <span className="lit-cover-title">{post.title}</span>
                      </div>
                    )}
                    <span className="lit-card-text">
                    <span className="lit-entry-title text-balance">{post.title}</span>
                    <span className="lit-date">
                      {post.date}
                      {post.external && (
                        <>
                          {" · "}
                          {new URL(post.external).hostname.endsWith("substack.com")
                            ? "substack ↗"
                            : "external ↗"}
                        </>
                      )}
                      {post.updated && ` · updated ${post.updated}`}
                    </span>
                    <span className="lit-summary">{post.summary}</span>
                    {post.tags.length > 0 && (
                      <span className="lit-date lit-tags">
                        {post.tags.join(" · ")}
                      </span>
                    )}
                    </span>
                  </Link>
                </FadeIn>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
