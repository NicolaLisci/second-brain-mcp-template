import type { VaultId } from "./config";
import { extractWikilinks, parseNote, titleOf } from "./frontmatter";
import { stems, tokenize } from "./text";
import type { VaultClient } from "./github";

/** `bodyTokens` holds STEMS, cut once per snapshot: matching re-tokenizes nothing, and both sides of a comparison are stemmed the same way. */
export interface ParsedNote { title: string; type: string; body: string; bodyTokens: Set<string>; tags: string[]; links: string[] }
export interface Snapshot { sha: string; notes: Map<string, ParsedNote> }

/**
 * One parsed copy of each vault per Durable Object isolate, keyed by branch head.
 * Reloading costs a single subrequest, so a stale entry is cheap to replace and a
 * fresh one saves us N Contents calls (the Workers Free plan caps a request at 50).
 */
const cache = new Map<VaultId, Snapshot>();

export function clearSnapshotCache(): void { cache.clear(); }

/** Alias for clearSnapshotCache, named for use as a test beforeEach hook. */
export function resetSnapshotCache(): void { cache.clear(); }

export async function getVaultSnapshot(client: VaultClient & { vault: VaultId }): Promise<Snapshot> {
  const sha = await client.headSha();
  const hit = cache.get(client.vault);
  if (hit && hit.sha === sha) return hit;

  const notes = new Map<string, ParsedNote>();
  for (const [path, content] of await client.loadAll(sha)) {
    const { frontmatter, body } = parseNote(content);
    notes.set(path, {
      title: titleOf(content, path),
      type: String(frontmatter.type ?? ""),
      body,
      bodyTokens: new Set(stems(tokenize(body))),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      links: extractWikilinks(body),
    });
  }
  const snap: Snapshot = { sha, notes };
  cache.set(client.vault, snap);
  return snap;
}
