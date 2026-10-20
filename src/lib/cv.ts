import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// content/cv.yaml is the single source of truth. The same file is rendered to
// PDF by RenderCV (npm run cv:pdf), so entries follow RenderCV's entry shapes.
const CV_FILE = path.join("content", "cv.yaml");

export type CvEntry =
  | { kind: "text"; text: string }
  | {
      kind: "experience";
      position: string;
      company: string;
      dates: string;
      location?: string;
      summary?: string;
      highlights: string[];
    }
  | {
      kind: "publication";
      title: string;
      authors: string[];
      journal?: string;
      doi?: string;
      url?: string;
      pdf?: string;
      code?: string;
      date?: string;
    }
  | {
      kind: "normal";
      name: string;
      summary?: string;
      dates?: string;
      location?: string;
      highlights: string[];
    };

export type CvSection = { title: string; entries: CvEntry[] };

export type Cv = {
  name: string;
  location?: string;
  website?: string;
  sections: CvSection[];
};

type Obj = Record<string, unknown>;

function fail(where: string, msg: string): never {
  throw new Error(`${CV_FILE}: ${where}: ${msg}`);
}

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(o: Obj, key: string, where: string): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" && typeof v !== "number") {
    fail(where, `"${key}" must be text`);
  }
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function req(o: Obj, key: string, where: string): string {
  const v = str(o, key, where);
  if (v === undefined) fail(where, `missing required "${key}"`);
  return v;
}

function list(o: Obj, key: string, where: string): string[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    fail(where, `"${key}" must be a list of text`);
  }
  return v as string[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2021-06" -> "Jun 2021"; "present" -> "present"; anything else is shown as written.
function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  }
  return d;
}

function dateRange(o: Obj, where: string): string | undefined {
  const date = str(o, "date", where);
  if (date) return fmtDate(date);
  const start = str(o, "start_date", where);
  const end = str(o, "end_date", where);
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`;
  return start ? fmtDate(start) : end ? fmtDate(end) : undefined;
}

function parseEntry(raw: unknown, where: string): CvEntry {
  if (typeof raw === "string") return { kind: "text", text: raw };
  if (!isObj(raw)) fail(where, "entry must be text or a map");
  if ("company" in raw || "position" in raw) {
    return {
      kind: "experience",
      position: req(raw, "position", where),
      company: req(raw, "company", where),
      dates: dateRange(raw, where) ?? "",
      location: str(raw, "location", where),
      summary: str(raw, "summary", where),
      highlights: list(raw, "highlights", where),
    };
  }
  if ("title" in raw) {
    const date = str(raw, "date", where);
    return {
      kind: "publication",
      title: req(raw, "title", where),
      authors: list(raw, "authors", where),
      journal: str(raw, "journal", where),
      doi: str(raw, "doi", where),
      url: str(raw, "url", where),
      pdf: str(raw, "pdf", where),
      code: str(raw, "code", where),
      date: date ? fmtDate(date) : undefined,
    };
  }
  if ("name" in raw) {
    return {
      kind: "normal",
      name: req(raw, "name", where),
      summary: str(raw, "summary", where),
      dates: dateRange(raw, where),
      location: str(raw, "location", where),
      highlights: list(raw, "highlights", where),
    };
  }
  fail(where, 'entry needs one of "position"/"company", "title", or "name"');
}

export function getCv(): Cv {
  const file = path.join(process.cwd(), CV_FILE);
  const doc: unknown = YAML.parse(fs.readFileSync(file, "utf8"));
  if (!isObj(doc) || !isObj(doc.cv)) fail("root", 'missing "cv:" map');
  const cv = doc.cv;
  if (!isObj(cv.sections)) fail("cv", 'missing "sections:" map');
  return {
    name: req(cv, "name", "cv"),
    location: str(cv, "location", "cv"),
    website: str(cv, "website", "cv"),
    sections: Object.entries(cv.sections).map(([title, entries]) => {
      if (!Array.isArray(entries)) fail(title, "section must be a list");
      return {
        title,
        entries: entries.map((e, i) => parseEntry(e, `${title}[${i}]`)),
      };
    }),
  };
}
