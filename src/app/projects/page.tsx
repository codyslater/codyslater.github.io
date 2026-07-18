import type { Metadata } from "next";
import { FadeIn } from "@/components/ui/FadeIn";
import { getProjects, projectPrimaryLink } from "@/lib/content";

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
            {projects.map((project, i) => {
              const primary = projectPrimaryLink(project);
              return (
                <FadeIn key={project.slug} delay={0.1 + 0.05 * i}>
                  <div className="h-full border border-border rounded p-5 bg-surface font-mono">
                    {primary ? (
                      <a
                        href={primary}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-base font-bold text-foreground hover:text-accent-green glow-hover transition-colors"
                      >
                        {project.title}
                      </a>
                    ) : (
                      <span className="text-base font-bold text-foreground">
                        {project.title}
                      </span>
                    )}
                    <p className="text-sm text-secondary mt-2">
                      {project.summary}
                    </p>
                    {project.tags.length > 0 && (
                      <p className="text-xs text-muted mt-3">
                        {project.tags.map((t) => `#${t}`).join(" ")}
                      </p>
                    )}
                    {Object.keys(project.links).length > 0 && (
                      <p className="text-xs mt-3 space-x-3">
                        {Object.entries(project.links).map(([key, href]) => (
                          <a
                            key={key}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-secondary hover:text-accent-green glow-hover transition-colors"
                          >
                            -&gt; {key}
                          </a>
                        ))}
                      </p>
                    )}
                  </div>
                </FadeIn>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
