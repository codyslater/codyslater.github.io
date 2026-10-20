import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { getProject, getProjects } from "@/lib/content";
import { mdxRemoteOptions } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx";

export function generateStaticParams() {
  const projects = getProjects();
  if (projects.length === 0) return [{ slug: "__none__" }];
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug === "__none__") notFound();
  const project = getProject(slug);
  return {
    title: project.title,
    description: project.summary,
    openGraph: {
      title: project.title,
      description: project.summary,
      type: "website",
      url: `/projects/${slug}/`,
    },
    twitter: {
      card: "summary",
      title: project.title,
      description: project.summary,
    },
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "__none__") notFound();
  const project = getProject(slug);
  const links = Object.entries(project.links);

  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <article className="max-w-2xl mx-auto">
        <p className="font-mono text-xs text-secondary mb-6">
          <Link
            href="/projects/"
            className="hover:text-accent-green glow-hover transition-colors"
          >
            &lt;- projects
          </Link>
        </p>
        {project.hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.hero} alt={project.title} className="w-full mb-8" />
        )}
        <header className="mb-10">
          <h1 className="font-mono text-2xl font-bold text-foreground">
            {project.title}
          </h1>
          <p className="font-mono text-sm text-secondary mt-3">
            {project.summary}
          </p>
        </header>
        <div className="prose-mono">
          <MDXRemote
            source={project.body}
            options={mdxRemoteOptions}
            components={mdxComponents}
          />
        </div>
        {links.length > 0 && (
          <footer className="font-mono text-sm mt-12 space-x-4">
            {links.map(([key, href]) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-green hover:underline glow-hover"
              >
                -&gt; {key}
              </a>
            ))}
          </footer>
        )}
      </article>
    </div>
  );
}
