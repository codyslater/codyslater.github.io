import type { Metadata } from "next";
import Link from "next/link";
import { FadeIn } from "@/components/ui/FadeIn";
import { getPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "writing",
  description: "Essays and notes by Cody Slater.",
  openGraph: {
    title: "writing",
    description: "Essays and notes by Cody Slater.",
    url: "/writing/",
  },
};

export default function WritingPage() {
  const posts = getPosts();

  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <FadeIn>
          <h1 className="text-2xl font-mono font-bold text-foreground mb-10">
            writing
          </h1>
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
          <ul className="space-y-8">
            {posts.map((post, i) => (
              <li key={post.slug} className="font-mono">
                <FadeIn delay={0.1 + 0.05 * i}>
                  <p className="text-xs text-muted">{post.date}</p>
                  <Link
                    href={`/writing/${post.slug}/`}
                    className="text-base text-foreground hover:text-accent-green glow-hover transition-colors"
                  >
                    {post.title}
                  </Link>
                  <p className="text-sm text-secondary mt-1">{post.summary}</p>
                </FadeIn>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
