import { CAPTURE_TIMEZONE, type NoteType } from "./config";
import { parseNote, serializeNote, type Frontmatter } from "./frontmatter";

export interface CaptureSource { kind: "url" | "path" | "jira" | "conversation" | "person"; ref: string; date?: string }
export interface CaptureFields {
  summary: string;
  why_it_matters?: string;
  fact?: string; interpretation?: string; idea?: string; decision?: string; action?: string;
  related?: string[];
  sources: CaptureSource[];
  tags?: string[];
}
export interface RenderMeta { capturedBy: string; trigger: "auto" | "explicit"; now: Date; timezone?: string }

type Mapping = Partial<Record<keyof CaptureFields, string>>;
/**
 * Where each field lands, per note type. The headings match the vaults' real templates, with one
 * exception: Project.md and Area.md carry no Sources section, so fillSection appends it. Without
 * it those notes keep no trace of the message or page that produced them — the commit body records
 * captured_by and trigger, but not the ref.
 */
const MAPPINGS: Record<NoteType, Mapping> = {
  concept: { summary: "## Summary", why_it_matters: "## Why it matters", related: "## Related", sources: "## Sources" },
  project: { summary: "## Outcome", why_it_matters: "## Why", action: "## Next actions", decision: "## Decisions", related: "## Relevant knowledge", sources: "## Sources" },
  area: { summary: "## Responsibility", why_it_matters: "## Standards", related: "## Related projects", sources: "## Sources" },
  source: { sources: "## Source", summary: "## Key points", why_it_matters: "## Personal takeaway", related: "## Related" },
};
const DISTILLATION: (keyof CaptureFields)[] = ["fact", "interpretation", "idea", "decision", "action"];
/** The vaults' Source template already has a section for this; use it instead of adding a second one. */
const DISTILLED_SECTION = "## Distilled knowledge";
const HEADING_RE = /^## .+$/gm;

/**
 * Empty every section we did not fill. The mapped ones are handled by fillSection, but a template
 * also carries sections outside the mapping — "## Distilled knowledge" in Source, "## Relevant
 * knowledge" in Area — and their placeholders would survive into the note. Area's placeholder is
 * literally "- [[]]", a broken wikilink, in every note the capture pipeline writes.
 */
function clearUnfilledSections(body: string, filled: Set<string>): string {
  const headings = [...body.matchAll(HEADING_RE)];
  if (!headings.length) return body;
  let out = body.slice(0, headings[0].index!);
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i][0];
    const start = headings[i].index! + heading.length;
    const end = i + 1 < headings.length ? headings[i + 1].index! : body.length;
    out += heading + (filled.has(heading) ? body.slice(start, end) : "\n\n");
  }
  return out;
}

export const isoDate = (d: Date, timeZone = CAPTURE_TIMEZONE) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function formatSource(s: CaptureSource): string {
  return `- ${s.kind}: ${s.ref}${s.date ? ` (${s.date})` : ""}`;
}

function contentFor(key: keyof CaptureFields, fields: CaptureFields, heading: string): string {
  const v = fields[key];
  if (key === "related") return (v as string[]).map((t) => `- [[${t}]]`).join("\n");
  if (key === "sources") return (v as CaptureSource[]).map(formatSource).join("\n");
  if (heading === "## Next actions") return `- [ ] ${v}`;
  if (heading === "## Decisions") return `- ${v}`;
  return String(v);
}

/**
 * Replace everything under `heading` (up to the next "## ") with `content`.
 * Empty content empties the section instead of writing a blank block, and a heading the template
 * does not carry is appended rather than fatal: a vault whose templates were renamed should lose
 * the layout of one section, not the whole capture.
 */
function fillSection(body: string, heading: string, content: string): string {
  const start = body.indexOf(`${heading}\n`);
  if (start < 0) return content ? `${body.replace(/\s+$/, "")}\n\n${heading}\n\n${content}\n` : body;
  const nextIdx = body.indexOf("\n## ", start + heading.length);
  const rest = nextIdx < 0 ? "" : body.slice(nextIdx + 1);
  const before = body.slice(0, start);
  return content ? `${before}${heading}\n\n${content}\n\n${rest}` : `${before}${heading}\n\n${rest}`;
}

export function renderNote(type: NoteType, template: string, title: string, fields: CaptureFields, meta: RenderMeta): string {
  const { frontmatter, body: tplBody } = parseNote(template);
  let body = tplBody.replace(/\{\{title\}\}/g, title);
  const mapping = MAPPINGS[type];

  const filled = new Set<string>();
  for (const [key, heading] of Object.entries(mapping) as [keyof CaptureFields, string][]) {
    const v = fields[key];
    // A section with nothing to say is emptied, never left holding the template's placeholder.
    const empty = v === undefined || (Array.isArray(v) && v.length === 0) || v === "";
    body = fillSection(body, heading, empty ? "" : contentFor(key, fields, heading));
    if (!empty) filled.add(heading);
  }
  body = clearUnfilledSections(body, filled);

  const extra = DISTILLATION.filter((k) => fields[k] && !(k in mapping));
  if (extra.length) {
    const block = extra.map((k) => `### ${k.charAt(0).toUpperCase() + k.slice(1)}\n\n${fields[k]}`).join("\n\n");
    body = body.includes(`${DISTILLED_SECTION}\n`)
      ? fillSection(body, DISTILLED_SECTION, block)
      : `${body.replace(/\s+$/, "")}\n\n## Distillation\n\n${block}\n`;
  }
  body = body.replace(/\s*$/, "\n");

  const date = isoDate(meta.now, meta.timezone);
  const fm: Frontmatter = { ...frontmatter, type, created: date };
  if ("updated" in frontmatter) fm.updated = date;
  if (fields.tags?.length) fm.tags = fields.tags;
  if (type === "source" && fields.sources[0]) {
    fm.source_type = fields.sources[0].kind;
    fm.source_url = fields.sources[0].ref;
  }
  fm.captured_by = meta.capturedBy;
  fm.trigger = meta.trigger;

  return serializeNote(fm, body);
}

export function renderUpdateSection(fields: CaptureFields, meta: RenderMeta): string {
  const parts: string[] = [fields.summary];
  for (const k of ["why_it_matters", ...DISTILLATION] as (keyof CaptureFields)[]) {
    if (fields[k]) parts.push(`**${k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}**\n\n${fields[k]}`);
  }
  if (fields.related?.length) parts.push(`**Related**\n\n${fields.related.map((t) => `- [[${t}]]`).join("\n")}`);
  if (fields.sources.length) parts.push(`**Sources**\n\n${fields.sources.map(formatSource).join("\n")}`);
  return `\n## Update ${isoDate(meta.now, meta.timezone)}\n\n${parts.join("\n\n")}\n`;
}
