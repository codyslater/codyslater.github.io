import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export type Post = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  updated?: string; // YYYY-MM-DD, never earlier than date
  cover?: string; // path under public/, e.g. /writing/foo/cover.png
  summary: string;
  tags: string[];
  draft: boolean;
  external?: string; // http(s) URL; the post lives there, so it has no page here
  body: string; // raw MDX
};

export type ProjectLinks = {
  github?: string;
  paper?: string;
  demo?: string;
  openvsx?: string; // an Open VSX listing, for extensions
};

// How each link is labelled on a project page; a key with no label shows as itself.
export const LINK_LABELS: Partial<Record<keyof ProjectLinks, string>> = { openvsx: "open vsx" };

export type Project = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  links: ProjectLinks;
  order?: number;
  hero?: string; // path under public/, e.g. /projects/foo/logo.svg
  cover?: string; // 4:3 gallery thumbnail under public/, e.g. /projects/foo/cover.webp
  video?: string; // hero video base, e.g. /projects/foo/route -> route_dark.mp4 (see ThemedVideo)
  videoThemed: boolean; // false: one cut for both themes, <base>.mp4 (frontmatter video_themed)
  draft: boolean;
  body: string;
};

const LINK_KEYS = ["github", "paper", "demo", "openvsx"] as const;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

type RawEntry = {
  slug: string;
  file: string; // repo-relative, for error messages
  data: Record<string, unknown>;
  body: string;
};

function readContentDir(dir: string): RawEntry[] {
  const abs = path.join(CONTENT_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(abs, f), "utf8");
      const { data, content } = matter(raw);
      return {
        slug: f.replace(/\.mdx$/, ""),
        file: path.join("content", dir, f),
        data,
        body: content,
      };
    });
}

function requireString(
  data: Record<string, unknown>,
  file: string,
  field: string,
): string {
  const v = data[field];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`${file}: missing required frontmatter field "${field}"`);
  }
  return v;
}

// YAML parses unquoted dates as Date objects; accept both forms.
function parseDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v))
  ) {
    return v;
  }
  return undefined;
}

function requireDate(data: Record<string, unknown>, file: string): string {
  const d = parseDate(data.date);
  if (d === undefined) {
    throw new Error(
      `${file}: frontmatter field "date" must be a valid YYYY-MM-DD date`,
    );
  }
  return d;
}

function optionalDate(
  data: Record<string, unknown>,
  file: string,
  field: string,
): string | undefined {
  if (data[field] === undefined) return undefined;
  const d = parseDate(data[field]);
  if (d === undefined) {
    throw new Error(
      `${file}: frontmatter field "${field}" must be a valid YYYY-MM-DD date`,
    );
  }
  return d;
}

function optionalTags(data: Record<string, unknown>, file: string): string[] {
  const v = data.tags;
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((t) => typeof t !== "string")) {
    throw new Error(
      `${file}: frontmatter field "tags" must be a list of strings`,
    );
  }
  return v as string[];
}

function optionalDraft(data: Record<string, unknown>, file: string): boolean {
  const v = data.draft;
  if (v === undefined) return false;
  if (typeof v !== "boolean") {
    throw new Error(`${file}: frontmatter field "draft" must be true or false`);
  }
  return v;
}

function optionalVideoThemed(data: Record<string, unknown>, file: string): boolean {
  const v = data.video_themed;
  if (v === undefined) return true;
  if (typeof v !== "boolean") {
    throw new Error(`${file}: frontmatter field "video_themed" must be true or false`);
  }
  return v;
}

function optionalImagePath(
  data: Record<string, unknown>,
  file: string,
  field: string,
): string | undefined {
  const v = data[field];
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !v.startsWith("/")) {
    throw new Error(
      `${file}: frontmatter field "${field}" must be a path starting with /`,
    );
  }
  return v;
}

function optionalExternal(
  data: Record<string, unknown>,
  file: string,
): string | undefined {
  const v = data.external;
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !/^https?:\/\//.test(v)) {
    throw new Error(
      `${file}: frontmatter field "external" must be an http(s) URL`,
    );
  }
  return v;
}

export function getPosts(): Post[] {
  const published = readContentDir("writing");
  // Unpublished work in content/drafts is git-ignored and dev-only: every file
  // there is a draft regardless of its frontmatter.
  const drafts = isProd()
    ? []
    : readContentDir("drafts").map((e) => ({
        ...e,
        data: { ...e.data, draft: true },
      }));
  const taken = new Set(published.map((e) => e.slug));
  for (const d of drafts) {
    if (taken.has(d.slug)) {
      throw new Error(
        `${d.file}: slug "${d.slug}" collides with content/writing/${d.slug}.mdx`,
      );
    }
  }
  return [...published, ...drafts]
    .map(({ slug, file, data, body }) => {
      const date = requireDate(data, file);
      const updated = optionalDate(data, file, "updated");
      if (updated !== undefined && updated < date) {
        throw new Error(
          `${file}: frontmatter field "updated" must not be earlier than "date"`,
        );
      }
      return {
        slug,
        title: requireString(data, file, "title"),
        date,
        updated,
        cover: optionalImagePath(data, file, "cover"),
        summary: requireString(data, file, "summary"),
        tags: optionalTags(data, file),
        draft: optionalDraft(data, file),
        external: optionalExternal(data, file),
        body,
      };
    })
    .filter((p) => !isProd() || !p.draft)
    .sort((a, b) =>
      a.date === b.date
        ? a.slug.localeCompare(b.slug)
        : b.date.localeCompare(a.date),
    );
}

export function getPost(slug: string): Post {
  const post = getPosts().find((p) => p.slug === slug);
  if (!post) {
    throw new Error(`content/writing/${slug}.mdx: post not found`);
  }
  return post;
}

export function getProjects(): Project[] {
  return readContentDir("projects")
    .map(({ slug, file, data, body }) => {
      const rawLinks = data.links ?? {};
      if (
        typeof rawLinks !== "object" ||
        rawLinks === null ||
        Array.isArray(rawLinks)
      ) {
        throw new Error(`${file}: frontmatter field "links" must be a map`);
      }
      const linkRecord = rawLinks as Record<string, unknown>;
      const links: ProjectLinks = {};
      for (const key of LINK_KEYS) {
        const v = linkRecord[key];
        if (v === undefined) continue;
        if (typeof v !== "string" || !v.startsWith("http")) {
          throw new Error(
            `${file}: frontmatter field "links.${key}" must be an http(s) URL`,
          );
        }
        links[key] = v;
      }
      const order = data.order;
      if (order !== undefined && typeof order !== "number") {
        throw new Error(`${file}: frontmatter field "order" must be a number`);
      }
      return {
        slug,
        title: requireString(data, file, "title"),
        summary: requireString(data, file, "summary"),
        tags: optionalTags(data, file),
        links,
        order: order as number | undefined,
        hero: optionalImagePath(data, file, "hero"),
        cover: optionalImagePath(data, file, "cover"),
        video: optionalImagePath(data, file, "video"),
        videoThemed: optionalVideoThemed(data, file),
        draft: optionalDraft(data, file),
        body,
      };
    })
    .filter((p) => !isProd() || !p.draft)
    .sort(
      (a, b) =>
        (a.order ?? Infinity) - (b.order ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
}

export function getProject(slug: string): Project {
  const project = getProjects().find((p) => p.slug === slug);
  if (!project) {
    throw new Error(`content/projects/${slug}.mdx: project not found`);
  }
  return project;
}

export function projectPrimaryLink(project: Project): string | null {
  for (const key of LINK_KEYS) {
    const href = project.links[key];
    if (href) return href;
  }
  return null;
}
