import type { Metadata } from "next";
import Link from "next/link";
import { FadeIn } from "@/components/ui/FadeIn";
import { serif } from "@/lib/fonts-serif";
import { getProjects } from "@/lib/content";
import { indexCover } from "@/lib/imageSize";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "projects",
  description: "Projects by Cody Slater.",
  path: "/projects/",
});

export default function ProjectsPage() {
  const projects = getProjects();

  return (
    <div
      className={`writing-literary min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="lit-bar mb-10">
            <h1 className="lit-heading">projects</h1>
          </div>
        </FadeIn>

        {projects.length === 0 ? (
          <FadeIn delay={0.1}>
            <div className="font-mono text-sm text-muted space-y-1">
              <p>
                <span className="text-accent-green">$</span> ls projects/
              </p>
              <p>nothing here yet — projects coming soon.</p>
            </div>
          </FadeIn>
        ) : (
          <ul className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-2">
            {projects.map((project, i) => {
              const thumb = project.cover ? indexCover(project.cover) : null;
              return (
              <li key={project.slug}>
                <FadeIn delay={0.1 + 0.05 * i}>
                  <Link href={`/projects/${project.slug}/`} className="lit-card">
                    {project.cover && thumb ? (
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
                        <span className="lit-cover-title">{project.title}</span>
                      </div>
                    )}
                    <span className="lit-card-text">
                      <span className="lit-entry-title text-balance">{project.title}</span>
                      <span className="lit-summary">{project.summary}</span>
                      {project.tags.length > 0 && (
                        <span className="lit-date lit-tags">
                          {project.tags.join(" · ")}
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
