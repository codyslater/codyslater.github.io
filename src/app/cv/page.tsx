import type { Metadata } from "next";
import { FadeIn } from "@/components/ui/FadeIn";
import { Authors, Inline } from "@/components/ui/Inline";
import { getCv, type CvEntry } from "@/lib/cv";
import { siteConfig } from "@/lib/constants";

const description = "Curriculum vitae of Cody Slater.";

export const metadata: Metadata = {
  title: "cv",
  description,
  openGraph: { title: "cv", description, url: "/cv/" },
};

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted mt-1">{children}</p>;
}

function Entry({ entry }: { entry: CvEntry }) {
  switch (entry.kind) {
    case "text":
      return <p className="text-sm text-secondary leading-relaxed">{entry.text}</p>;
    case "experience":
      return (
        <>
          <p className="text-sm font-bold text-foreground">{entry.position}</p>
          <p className="text-sm text-secondary mt-1">{entry.company}</p>
          <Meta>
            {[entry.dates, entry.location].filter(Boolean).join(" · ")}
          </Meta>
          {entry.summary && (
            <p className="text-xs text-muted mt-1">
              <Inline text={entry.summary} />
            </p>
          )}
          <Highlights items={entry.highlights} />
        </>
      );
    case "publication": {
      const href = entry.doi ? `https://doi.org/${entry.doi}` : entry.url;
      return (
        <>
          <p className="text-sm font-bold text-foreground">{entry.title}</p>
          {entry.authors.length > 0 && (
            <p className="text-sm text-secondary mt-1">
              <Authors names={entry.authors} />
            </p>
          )}
          <Meta>
            {[entry.journal, entry.date].filter(Boolean).join(" · ")}
            {href && (
              <>
                {" "}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-green hover:underline glow-hover"
                >
                  -&gt; doi
                </a>
              </>
            )}
            {entry.authors.some((a) => a.includes("†")) && " · † equal contribution"}
          </Meta>
        </>
      );
    }
    case "normal":
      return (
        <>
          <p className="text-sm font-bold text-foreground">{entry.name}</p>
          {entry.summary && (
            <p className="text-sm text-secondary mt-1">{entry.summary}</p>
          )}
          <Meta>
            {[entry.dates, entry.location].filter(Boolean).join(" · ")}
          </Meta>
          <Highlights items={entry.highlights} />
        </>
      );
  }
}

function Highlights({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm text-secondary">
      {items.map((h) => (
        <li key={h} className="flex gap-2">
          <span className="text-muted">-</span>
          <span>
            <Inline text={h} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CvPage() {
  const cv = getCv();

  return (
    <div className="min-h-screen pt-20 pb-20 px-4">
      <div className="max-w-3xl mx-auto font-mono">
        <FadeIn>
          <header className="mb-10">
            <h1 className="text-2xl font-bold text-foreground">cv</h1>
            <p className="text-sm text-secondary mt-3">
              {[cv.name, cv.location].filter(Boolean).join(" · ")}
            </p>
            <p className="text-sm mt-4">
              <a
                href={siteConfig.links.cvPdf}
                className="text-accent-green hover:underline glow-hover"
              >
                -&gt; download pdf
              </a>
            </p>
          </header>
        </FadeIn>

        {cv.sections.map((section, s) => (
          <section key={section.title} className="mb-10">
            <FadeIn delay={0.05}>
              <h2 className="text-lg font-bold text-accent-green mb-4">
                {section.title.toLowerCase()}
              </h2>
            </FadeIn>
            <div className="space-y-3">
              {section.entries.map((entry, i) => (
                <FadeIn key={`${s}-${i}`} delay={0.05}>
                  <div className="border border-border rounded p-4 bg-surface">
                    <Entry entry={entry} />
                  </div>
                </FadeIn>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
