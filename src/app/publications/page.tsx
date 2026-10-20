import type { Metadata } from "next";
import { FadeIn } from "@/components/ui/FadeIn";
import { Authors } from "@/components/ui/Inline";
import { ThemeToggle } from "@/components/writing/ThemeToggle";
import { ThemeScript } from "@/components/writing/ThemeScript";
import { serif } from "@/lib/fonts";
import { getCv, type CvEntry } from "@/lib/cv";
import { siteConfig } from "@/lib/constants";

const description = "Publications and preprints by Cody Slater.";

export const metadata: Metadata = {
  title: "publications",
  description,
  openGraph: { title: "publications", description, url: "/publications/" },
};

type Pub = Extract<CvEntry, { kind: "publication" }>;

const SECTION = "Publications & Papers";

// Preprints and submitted work get their own block, not a year.
const isPreprint = (p: Pub) => /submitted|preprint/i.test(p.journal ?? "");

// The venue string ends in its year: "... 7(9), 103514 (2026)".
const yearOf = (p: Pub) => /\((\d{4})\)\s*$/.exec(p.journal ?? "")?.[1] ?? "other";

function groupByYear(pubs: Pub[]): [string, Pub[]][] {
  const years = new Map<string, Pub[]>();
  for (const p of pubs) years.set(yearOf(p), [...(years.get(yearOf(p)) ?? []), p]);
  return [...years].sort(([a], [b]) => b.localeCompare(a));
}

const linkClass = "lit-link";

function Pub({ pub }: { pub: Pub }) {
  const href = pub.doi ? `https://doi.org/${pub.doi}` : pub.url;
  const title = <span className="text-sm font-bold text-foreground">{pub.title}</span>;
  const extras = [
    pub.pdf && { label: "PDF", href: pub.pdf },
    pub.code && { label: "code", href: pub.code },
  ].filter((x): x is { label: string; href: string } => Boolean(x));

  return (
    <div data-pub>
      <p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="lit-entry-title lit-link">
            {pub.title}
          </a>
        ) : (
          <span className="lit-entry-title">{pub.title}</span>
        )}
      </p>
      {pub.authors.length > 0 && (
        <p className="lit-summary mt-1">
          <Authors names={pub.authors} />
        </p>
      )}
      <p className="lit-date mt-1">{pub.journal}</p>
      {extras.length > 0 && (
        <p className="text-xs mt-1 flex gap-3">
          {extras.map((x) => (
            <a key={x.label} href={x.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {x.label}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}

function Block({ title, pubs }: { title: string; pubs: Pub[] }) {
  return (
    <section className="mb-10">
      <FadeIn delay={0.05}>
        <h2 className="lit-date mb-4">{title}</h2>
      </FadeIn>
      <div className="space-y-6">
        {pubs.map((p) => (
          <FadeIn key={p.title} delay={0.05}>
            <Pub pub={p} />
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

export default function PublicationsPage() {
  const section = getCv().sections.find((s) => s.title === SECTION);
  if (!section) throw new Error(`content/cv.yaml: missing section "${SECTION}"`);
  const pubs = section.entries.filter((e): e is Pub => e.kind === "publication");
  if (pubs.length !== section.entries.length) {
    throw new Error(`content/cv.yaml: "${SECTION}" has an entry without a title`);
  }

  const preprints = pubs.filter(isPreprint);

  return (
    <div
      className={`writing-literary min-h-screen pt-20 pb-20 px-4 ${serif.variable}`}
    >
      <ThemeScript />
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="lit-bar mb-10">
            <h1 className="lit-heading">publications</h1>
            <ThemeToggle />
          </div>
        </FadeIn>

        {preprints.length > 0 && <Block title="preprints & submitted" pubs={preprints} />}
        {groupByYear(pubs.filter((p) => !isPreprint(p))).map(([year, list]) => (
          <Block key={year} title={year} pubs={list} />
        ))}

        <p className="lit-summary">
          † equal contribution · also on{" "}
          <a href={siteConfig.links.scholar} target="_blank" rel="noopener noreferrer" className="lit-link">
            google scholar
          </a>
        </p>
      </div>
    </div>
  );
}
