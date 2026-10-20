import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote-client/rsc";
import { getProject, getProjects, LINK_LABELS } from "@/lib/content";
import { mdxRemoteOptions } from "@/lib/mdx";
import { mdxComponents } from "@/components/mdx";
import { ThemeToggle } from "@/components/writing/ThemeToggle";
import { ThemeScript } from "@/components/writing/ThemeScript";
import { ThemedVideo } from "@/components/writing/ThemedMedia";
import { serif } from "@/lib/fonts";

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
    <div
      className={`writing-literary reading min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <ThemeScript />
      <article className="max-w-2xl mx-auto">
        <p className="lit-date mb-6">
          <Link href="/projects/" className="lit-back">
            ← projects
          </Link>
        </p>
        {project.video ? (
          <div className="mb-8">
            <ThemedVideo
              base={project.video}
              label={project.summary}
              themed={project.videoThemed}
            />
          </div>
        ) : (
          project.hero && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.hero}
              alt={project.title}
              className="lit-hero mb-8"
            />
          )
        )}
        <header className="lit-header mb-10">
          <div className="lit-bar">
            <p className="lit-date">{project.tags.join(" · ")}</p>
            <ThemeToggle />
          </div>
          <h1 className="lit-title mt-2">{project.title}</h1>
          <p className="lit-lede mt-3">{project.summary}</p>
          {links.length > 0 && (
            <p className="lit-date lit-links mt-4">
              {links.map(([key, href]) => (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer">
                  {LINK_LABELS[key as keyof typeof LINK_LABELS] ?? key} ↗
                </a>
              ))}
            </p>
          )}
        </header>
        <div className="prose-mono literary-prose project-prose">
          <MDXRemote
            source={project.body}
            options={mdxRemoteOptions}
            components={mdxComponents}
          />
        </div>
      </article>
    </div>
  );
}
