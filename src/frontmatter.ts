export type Frontmatter = Record<string, string | string[]>;

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseNote(md: string): { frontmatter: Frontmatter; body: string } {
  const m = md.match(FM_RE);
  if (!m) return { frontmatter: {}, body: md };
  const frontmatter: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    const v = raw.trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      frontmatter[key] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      frontmatter[key] = v;
    }
  }
  return { frontmatter, body: md.slice(m[0].length) };
}

export function serializeNote(frontmatter: Frontmatter, body: string): string {
  const lines = Object.entries(frontmatter).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.join(", ")}]`;
    return v === "" ? `${k}:` : `${k}: ${v}`;
  });
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

export function extractWikilinks(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function titleOf(md: string, path: string): string {
  const h1 = parseNote(md).body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return path.split("/").pop()!.replace(/\.md$/, "");
}

/**
 * Set `updated: <date>` in a note's frontmatter WITHOUT parsing or re-serializing it.
 * Every other byte of the file is preserved (block-style lists, comments, quoting, CRLF).
 */
export function bumpUpdated(md: string, date: string): string {
  const m = md.match(FM_RE);
  if (!m) return `---\nupdated: ${date}\n---\n${md}`;
  const eol = m[0].startsWith("---\r\n") ? "\r\n" : "\n";
  const inner = m[1];
  // Test for the match, not for a difference: re-bumping with the same date leaves the
  // string identical, and a value comparison would read that as "no updated: line" and
  // append a second one on every same-day update.
  const has = /^updated:.*$/m.test(inner);
  const newInner = has
    ? inner.replace(/^updated:.*$/m, `updated: ${date}`)
    : inner === ""
      ? `updated: ${date}`
      : `${inner}${eol}updated: ${date}`;
  const lead = m[0].slice(0, eol.length + 3);
  const trailer = m[0].slice(lead.length + inner.length);
  return `${lead}${newInner}${trailer}${md.slice(m[0].length)}`;
}
