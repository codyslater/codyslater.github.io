import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const CONTENT_ROOT = path.join(process.cwd(), "content");

export type Post = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  tags: string[];
  draft: boolean;
  body: string; // raw MDX
};

export type ProjectLinks = {
  github?: string;
  paper?: string;
  demo?: string;
};

export type Project = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  links: ProjectLinks;
  order?: number;
  draft: boolean;
  body: string;
};

const LINK_KEYS = ["github", "paper", "demo"] as const;

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
function requireDate(data: Record<string, unknown>, file: string): string {
  const v = data.date;
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
  throw new Error(
    `${file}: frontmatter field "date" must be a valid YYYY-MM-DD date`,
  );
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

export function getPosts(): Post[] {
  return readContentDir("writing")
    .map(({ slug, file, data, body }) => ({
      slug,
      title: requireString(data, file, "title"),
      date: requireDate(data, file),
      summary: requireString(data, file, "summary"),
      tags: optionalTags(data, file),
      draft: optionalDraft(data, file),
      body,
    }))
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

export function projectPrimaryLink(project: Project): string | null {
  for (const key of LINK_KEYS) {
    const href = project.links[key];
    if (href) return href;
  }
  return null;
}
