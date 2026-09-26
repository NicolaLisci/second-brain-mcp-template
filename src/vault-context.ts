import type { VaultId } from "./config";
import type { VaultClient } from "./github";
import { searchVault } from "./search";
import { getVaultSnapshot } from "./snapshot";
import { PROVENANCE_TAGS } from "./text";

/**
 * What the vault already contains, shown to the model so it classifies against the real vault
 * instead of in the abstract: nearby notes to link to and to route by, and the tag vocabulary
 * already in use. Both come from the snapshot `capture` is about to load anyway — cached per
 * head sha, so this costs no extra request on the vault that ends up being written.
 */
export interface VaultContext {
  /** Titles of the notes closest to the message, most relevant first. */
  titles: string[];
  /** The most used topical tags in the vault. */
  tags: string[];
}

const MAX_TITLES = 8;
const MAX_TAGS = 25;

export async function vaultContext(client: VaultClient & { vault: VaultId }, query: string): Promise<VaultContext> {
  try {
    const [results, { notes }] = await Promise.all([searchVault(client, query, MAX_TITLES), getVaultSnapshot(client)]);
    const counts = new Map<string, number>();
    for (const n of notes.values()) {
      for (const raw of n.tags) {
        const t = raw.trim().toLowerCase();
        if (t && !PROVENANCE_TAGS.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return {
      titles: results.map((r) => r.title).filter(Boolean),
      tags: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, MAX_TAGS).map(([t]) => t),
    };
  } catch (error) {
    // Context is an improvement, not a precondition: classify without it rather than fail.
    console.warn("could not read the vault context", error);
    return { titles: [], tags: [] };
  }
}

/**
 * Keep only the wikilink targets that exist, and emit the FILENAME stem rather than the H1 title:
 * Obsidian resolves `[[X]]` against filenames, so linking an H1 that differs from its filename
 * would write a broken link into the vault.
 */
export async function resolveRelated(
  client: VaultClient & { vault: VaultId }, titles: string[], selfTitle?: string,
): Promise<string[]> {
  if (!titles.length) return [];
  try {
    const { notes } = await getVaultSnapshot(client);
    const byName = new Map<string, string>();
    for (const [path, n] of notes) {
      const stem = path.split("/").pop()!.replace(/\.md$/, "");
      byName.set(stem.toLowerCase(), stem);
      if (!byName.has(n.title.toLowerCase())) byName.set(n.title.toLowerCase(), stem);
    }
    const self = selfTitle?.trim().toLowerCase();
    const out: string[] = [];
    for (const t of titles) {
      const key = t.trim().toLowerCase();
      const stem = byName.get(key);
      if (stem && key !== self && !out.includes(stem)) out.push(stem);
    }
    return out.slice(0, 5);
  } catch (error) {
    console.warn("could not resolve the related notes", error);
    return [];
  }
}
