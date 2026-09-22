import seed from "../../content/content.json";


/**
 * A skill is either a bare name or a name with its record: the year it was
 * first used and one line of context.
 *
 * Every field past `name` is optional so that a `content.json` written before
 * the richer form existed still renders. The R2 bucket can be updated
 * independently of a deploy, so the running code has to tolerate an older
 * document: a rack whose entries carry no year simply draws without the
 * figure and without the service bar.
 *
 * `used` is such a field. It once listed the work an entry had shipped in and
 * is no longer drawn, but a document still carrying it has to load rather
 * than fail, so it is accepted here and dropped by the normalizer.
 */
export type SkillItem =
  | string
  | { name: string; since?: number; note?: string; used?: string[] };

export interface Skill {
  name: string;
  /** Four-digit year of first use, or null when the document does not say. */
  since: number | null;
  note: string;
}

/* Wide enough to catch a typo'd year without rejecting a real one. A figure
   outside it would stretch the service bars every entry is measured against,
   so it is dropped rather than clamped. */
const YEAR_FLOOR = 1970;

export function normalizeSkill(item: SkillItem): Skill {
  if (typeof item === "string") return { name: item, since: null, note: "" };
  const year = Number(item.since);
  const now = new Date().getFullYear();
  return {
    name: item.name,
    since:
      Number.isInteger(year) && year >= YEAR_FLOOR && year <= now ? year : null,
    note: typeof item.note === "string" ? item.note : "",
  };
}

/**
 * A project as it may arrive from the bucket.
 *
 * The card carries one line and the dossier carries the paragraphs, but an
 * older document put the whole write-up in `summary` and carried resume
 * metrics in `bullets`. Both fields stay optional here so such a document
 * still types and still renders; `normalizeProject` reconciles them.
 */
export interface ProjectEntry {
  id: string;
  name: string;
  tagline: string;
  year: string;
  summary: string;
  overview?: string[];
  bullets?: string[];
  stack: string[];
  links: { site?: string; github?: string };
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  year: string;
  /** One sentence, shown on the card. */
  summary: string;
  /** The full write-up, shown in the dossier. */
  overview: string[];
  stack: string[];
  links: { site?: string; github?: string };
}

/** Paragraphs are separated by a blank line, the way they are written. */
const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean);

/*
 * Enough of a sentence to stand alone on the card. An abbreviation mid-clause
 * would cut it short, so a suspiciously brief result is discarded in favour of
 * the whole paragraph - too long on a card beats truncated to nonsense.
 */
const MIN_CARD_SENTENCE = 40;

function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  if (!match || match[0].length < MIN_CARD_SENTENCE) return text;
  return match[0];
}

export function normalizeProject(entry: ProjectEntry): Project {
  const written = Array.isArray(entry.overview)
    ? entry.overview.map((para) => para.trim()).filter(Boolean)
    : [];
  const summary = entry.summary ?? "";
  const overview = written.length > 0 ? written : paragraphsOf(summary);

  return {
    id: entry.id,
    name: entry.name,
    tagline: entry.tagline,
    year: entry.year,
    /* With no overview of its own, the summary is the write-up, and the card
       gets its opening sentence rather than all of it. */
    summary: written.length > 0 ? summary : firstSentence(overview[0] ?? summary),
    overview,
    stack: Array.isArray(entry.stack) ? entry.stack : [],
    links: entry.links ?? {},
  };
}

export interface SiteContent {
  version: number;
  meta: {
    name: string;
    firstName: string;
    lastName: string;
    role: string;
    tagline: string;
    location: {
      city: string;
      region: string;
      country: string;
      lat: number;
      lon: number;
      timezone: string;
    };
    status: { available: boolean; label: string };
    resumeFile: string;
    seo: { title: string; description: string; url: string };
  };
  summary: string;
  links: { id: string; label: string; value: string; href: string }[];
  experience: {
    id: string;
    role: string;
    org: string;
    orgNote: string | null;
    location: string | null;
    start: string;
    end: string | null;
    current: boolean;
    period: string;
    bullets: string[];
  }[];
  projects: ProjectEntry[];
  contact: {
    heading: string;
    invitation: string;
    note: string;
  };
  skills: { group: string; items: SkillItem[] }[];
  education: {
    id: string;
    school: string;
    credential: string;
    location: string | null;
  }[];
  certifications: {
    id: string;
    name: string;
    code: string;
    issuer: string;
    date: string;
    verify: string | null;
  }[];
}

/** Compiled into the bundle so the site renders even if the API is unreachable. */
export const fallbackContent = seed as SiteContent;

/**
 * Minimal shape check. A partial or malformed upload should fall back rather
 * than render a broken page.
 */
function isUsable(value: unknown): value is SiteContent {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Partial<SiteContent>;
  return (
    typeof c.meta?.name === "string" &&
    typeof c.summary === "string" &&
    Array.isArray(c.experience) &&
    Array.isArray(c.projects) &&
    Array.isArray(c.skills)
  );
}

export async function loadContent(signal?: AbortSignal): Promise<SiteContent> {
  try {
    const res = await fetch("/api/content", { signal });
    if (!res.ok) return fallbackContent;
    const data: unknown = await res.json();
    return isUsable(data) ? data : fallbackContent;
  } catch {
    return fallbackContent;
  }
}

export const RESUME_VIEW_URL = "/resume.pdf";
export const RESUME_DOWNLOAD_URL = "/resume.pdf?download=1";
