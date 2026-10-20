import type { Metadata } from "next";
import Link from "next/link";
import { FadeIn } from "@/components/ui/FadeIn";
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
    <div className="min-h-screen pt-20 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <FadeIn>
          <h1 className="text-2xl font-mono font-bold text-foreground mb-10">
            projects
          </h1>
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
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project, i) => (
              <FadeIn key={project.slug} delay={0.1 + 0.05 * i}>
                <div className="h-full border border-border rounded p-5 bg-surface font-mono">
                  <Link
                    href={`/projects/${project.slug}/`}
                    className="text-base font-bold text-foreground hover:text-accent-green glow-hover transition-colors"
                  >
                    {project.title}
                  </Link>
                  <p className="text-sm text-secondary mt-2">
                    {project.summary}
                  </p>
                  {project.tags.length > 0 && (
                    <p className="text-xs text-secondary mt-3">
                      {project.tags.map((t) => `#${t}`).join(" ")}
                    </p>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
