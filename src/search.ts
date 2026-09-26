import type { VaultId } from "./config";
import type { VaultClient } from "./github";
import { getVaultSnapshot, type ParsedNote } from "./snapshot";
import { PROVENANCE_TAGS, stem, stems, tokenize } from "./text";

export interface SearchResult {
  vault: VaultId; path: string; title: string; type: string; score: number;
  /** the best matching lines, for showing to a human */
  excerpt: string;
  /** the same passage with more room around it, for feeding a model */
  passage: string;
  /**
   * How much of the query this note actually carries, 0..1, weighted by how rare each word is in
   * the vault. Zero means it was pulled in by a wikilink from a note that did match — useful for
   * widening the duplicate net, useless as an answer to a question. Kept separate from `score`
   * on purpose: `score` decides duplicates, `coverage` decides what is worth showing a human.
   */
  coverage: number;
}
export const CANDIDATE_THRESHOLD = 3;
/**
 * How much of a question a note must carry to be worth showing as an answer. Deliberately
 * unrelated to CANDIDATE_THRESHOLD: that one decides duplicates on the raw score, this one decides
 * relevance to a human on rarity-weighted coverage. Below it, "non ho trovato nulla" is a better
 * answer than four notes that share a word by accident.
 */
export const ANSWER_COVERAGE = 0.5;

export { tokenize };

// weights: title 3, each matching tag 2, body 2 (1 when the body covers less than half the
// query), code-search hit 1 — so body+code or body+tag still reach CANDIDATE_THRESHOLD without
// a title match, but one shared word out of many no longer does.
function titleScore(title: string, q: string[]): number {
  const t = new Set(stems(tokenize(title)));
  if (t.size === 0 || q.length === 0) return 0;
  const hits = q.filter((x) => t.has(x)).length;
  return hits / q.length >= 0.5 || [...t].every((x) => q.includes(x)) ? 3 : 0;
}

/**
 * Whole words, and graded by how much of the query the body actually covers. The old substring
 * scan matched "bot" inside "robot", and its flat weight let ONE shared word out of six read as
 * a duplicate — which is how every Telegram capture became a duplicate of every other one.
 */
function bodyScore(n: ParsedNote, q: string[]): number {
  if (q.length === 0) return 0;
  const distinct = new Set(q);
  let hits = 0;
  for (const t of distinct) if (n.bodyTokens.has(t)) hits++;
  if (hits === 0) return 0;
  return hits / distinct.size >= 0.5 ? 2 : 1;
}

/**
 * The lines that actually answer the query, with the heading they sit under.
 * The old version returned the FIRST line containing ANY query word and dropped headings
 * entirely, so asking "quota spese mensili" surfaced a line about a spreadsheet being read-only
 * while a more relevant monthly-cost line sat several lines below, unseen.
 */
function bestPassage(body: string, q: string[], maxLines: number, maxChars: number): string {
  const lines = body.split("\n");
  const headings: string[] = [];
  let current = "";
  for (const raw of lines) {
    const t = raw.trim();
    if (/^#{1,6}\s/.test(t)) current = t.replace(/^#+\s*/, "").trim();
    headings.push(current);
  }

  let bestScore = 0;
  let bestIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || /^#{1,6}\s/.test(t)) continue;
    const inLine = new Set(stems(tokenize(t)));
    const inHead = new Set(stems(tokenize(headings[i])));
    const hits = q.filter((x) => inLine.has(x)).length;
    const headHits = q.filter((x) => inHead.has(x)).length;
    // the heading counts, but never outweighs the line itself
    const score = hits * 2 + headHits;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  const out: string[] = [];
  if (bestIdx < 0) {
    for (const raw of lines) {
      const t = raw.trim();
      if (t && !/^#{1,6}\s/.test(t)) out.push(t);
      if (out.length >= maxLines) break;
    }
  } else {
    if (headings[bestIdx]) out.push(headings[bestIdx]);
    for (let i = bestIdx; i < lines.length && out.length < maxLines; i++) {
      const t = lines[i].trim();
      if (/^#{1,6}\s/.test(t)) break;   // stop at the next section
      if (t) out.push(t);
    }
  }
  const text = out.join("\n");
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export async function searchVault(client: VaultClient & { vault: VaultId }, query: string, limit: number): Promise<SearchResult[]> {
  const q = stems(tokenize(query));
  const { notes: loaded } = await getVaultSnapshot(client);
  const codeHits = new Set(await client.searchCode(query));

  // Everything a note can be matched on, cut once: also the denominator of the rarity weights.
  const tokensOf = new Map<string, Set<string>>();
  for (const [path, n] of loaded) {
    const all = new Set(n.bodyTokens);
    for (const t of stems(tokenize(n.title))) all.add(t);
    for (const t of n.tags) all.add(stem(t.toLowerCase()));
    tokensOf.set(path, all);
  }
  const distinct = [...new Set(q)];
  // A word the whole vault uses says nothing; a word one note uses says everything. Without this,
  // matching "stremio" (rare, decisive) counted the same as matching "quota" by coincidence.
  const weight = new Map<string, number>();
  for (const t of distinct) {
    let df = 0;
    for (const all of tokensOf.values()) if (all.has(t)) df++;
    weight.set(t, Math.log((loaded.size + 1) / (df + 1)) + 0.1);
  }
  const total = distinct.reduce((sum, t) => sum + weight.get(t)!, 0) || 1;

  const scores = new Map<string, number>();
  const coverages = new Map<string, number>();
  for (const [path, n] of loaded) {
    let s = titleScore(n.title, q);
    s += 2 * n.tags.filter((t) => !PROVENANCE_TAGS.has(t.toLowerCase()) && q.includes(stem(t.toLowerCase()))).length;
    if (codeHits.has(path)) s += 1;
    s += bodyScore(n, q);
    if (s > 0) {
      scores.set(path, s);
      const all = tokensOf.get(path)!;
      coverages.set(path, distinct.filter((t) => all.has(t)).reduce((sum, t) => sum + weight.get(t)!, 0) / total);
    }
  }

  // pass 3: one wikilink hop from scored notes (resolve by H1 title or filename stem)
  const byTitle = new Map<string, string>();
  for (const [p, n] of loaded) {
    byTitle.set(n.title.toLowerCase(), p);
    const stem = p.split("/").pop()!.replace(/\.md$/, "");
    if (!byTitle.has(stem.toLowerCase())) byTitle.set(stem.toLowerCase(), p);
  }
  for (const path of [...scores.keys()]) {
    for (const link of loaded.get(path)!.links) {
      const target = byTitle.get(link.toLowerCase());
      if (target && !scores.has(target)) scores.set(target, 0.5);
    }
  }

  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, score]) => {
      const n = loaded.get(path)!;
      return {
        vault: client.vault, path, title: n.title, type: n.type, score, coverage: coverages.get(path) ?? 0,
        excerpt: bestPassage(n.body, q, 4, 320),
        passage: bestPassage(n.body, q, 14, 900),
      };
    });
}
