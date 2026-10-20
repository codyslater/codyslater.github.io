import type { Metadata } from "next";
import Link from "next/link";
import { FadeIn } from "@/components/ui/FadeIn";
import { ThemeToggle } from "@/components/writing/ThemeToggle";
import { ThemeScript } from "@/components/writing/ThemeScript";
import { serif } from "@/lib/fonts";
import { getProjects } from "@/lib/content";

export const metadata: Metadata = {
  title: "projects",
  description: "Projects by Cody Slater.",
  openGraph: {
    title: "projects",
    description: "Projects by Cody Slater.",
    url: "/projects/",
  },
};

export default function ProjectsPage() {
  const projects = getProjects();

  return (
    <div
      className={`writing-literary min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <ThemeScript />
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="lit-bar mb-10">
            <h1 className="lit-heading">projects</h1>
            <ThemeToggle />
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
            {projects.map((project, i) => (
              <li key={project.slug}>
                <FadeIn delay={0.1 + 0.05 * i}>
                  <Link href={`/projects/${project.slug}/`} className="lit-card">
                    {project.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={project.cover} alt="" className="lit-cover" />
                    ) : (
                      <div className="lit-cover lit-cover-fallback">
                        <span className="lit-cover-title">{project.title}</span>
                      </div>
                    )}
                    <span className="lit-card-text">
                      <span className="lit-entry-title">{project.title}</span>
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
