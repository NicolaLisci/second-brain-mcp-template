import { VAULTS, type VaultId } from "./config";
import { parseTar } from "./tar";

export interface TreeEntry { path: string; sha: string }
export interface FileContent { path: string; content: string; sha: string }
export interface CommitRequest {
  message: string;
  files: { path: string; content: string }[];
  /** Called with the current HEAD sha before building the tree; return files to write. Re-invoked on retry. */
  prepare?: (headSha: string) => Promise<{ path: string; content: string }[]>;
}
export interface VaultClient {
  headSha(): Promise<string>;
  loadAll(ref: string): Promise<Map<string, string>>;
  listMarkdown(): Promise<TreeEntry[]>;
  getFile(path: string, ref?: string): Promise<FileContent | null>;
  searchCode(query: string): Promise<string[]>;
  commitFiles(req: CommitRequest): Promise<{ sha: string; url: string }>;
}

export interface OctokitLike {
  rest: {
    git: {
      getRef(p: any): Promise<{ data: { object: { sha: string } } }>;
      getCommit(p: any): Promise<{ data: { tree: { sha: string } } }>;
      getTree(p: any): Promise<{ data: { tree: { path?: string; type?: string; sha?: string }[] } }>;
      createBlob(p: any): Promise<{ data: { sha: string } }>;
      createTree(p: any): Promise<{ data: { sha: string } }>;
      createCommit(p: any): Promise<{ data: { sha: string; html_url: string } }>;
      updateRef(p: any): Promise<unknown>;
    };
    repos: { getContent(p: any): Promise<{ data: any }> };
    search: { code(p: any): Promise<{ data: { items: { path: string }[] } }> };
  };
  request(route: string, params?: any): Promise<{ data: unknown }>;
}

/** Root-level system/landing files: not knowledge, never searchable or dedup candidates. */
const ROOT_SYSTEM_FILES = new Set(["AGENTS.md", "CLAUDE.md", "README.md", "Home.md"]);

export function isVaultNote(path: string): boolean {
  return (
    path.endsWith(".md") &&
    !path.startsWith(".obsidian/") &&
    !path.startsWith("90 System/") &&
    !ROOT_SYSTEM_FILES.has(path)
  );
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
  return new Uint8Array(await new Response(src.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

export const COMMIT_AUTHOR = { name: "Second Brain MCP", email: "second-brain-mcp@users.noreply.github.com" };
const MAX_ATTEMPTS = 3;

/**
 * GitHub rejects a search query over 256 characters, and counts them AFTER URI encoding — every
 * space becomes %20 — so the real ceiling is lower than it looks and moves with the content. A
 * capture searches on title plus summary, which clears it on any substantial note, and the whole
 * duplicate check failed with "query exceeds max length" instead of degrading.
 *
 * Cut well short of the cap, on a word boundary: what is left is only a weak +1 signal, and the
 * in-memory scan of the vault does the real matching.
 */
export const MAX_SEARCH_QUERY = 120;
export function truncateSearchQuery(query: string, max = MAX_SEARCH_QUERY): string {
  const q = query.replace(/\s+/g, " ").trim();
  if (q.length <= max) return q;
  const cut = q.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > max / 2 ? cut.slice(0, boundary) : cut).trim();
}

export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}

/** Generic in the vault id so `new GitHubVault(octokit, "work")` keeps the literal type callers require. */
export class GitHubVault<V extends VaultId = VaultId> implements VaultClient {
  private readonly owner: string; private readonly repo: string; private readonly branch: string;
  constructor(private octokit: OctokitLike, public readonly vault: V, repos: typeof VAULTS = VAULTS) {
    ({ owner: this.owner, repo: this.repo, branch: this.branch } = repos[vault]);
  }
  private get base() { return { owner: this.owner, repo: this.repo }; }

  async headSha(): Promise<string> {
    return (await this.octokit.rest.git.getRef({ ...this.base, ref: `heads/${this.branch}` })).data.object.sha;
  }

  protected async fetchTarball(ref: string): Promise<Uint8Array> {
    const { data } = await this.octokit.request("GET /repos/{owner}/{repo}/tarball/{ref}", {
      ...this.base, ref, request: { redirect: "follow" },
    });
    return new Uint8Array(data as ArrayBuffer);
  }

  async loadAll(ref: string): Promise<Map<string, string>> {
    const tar = await gunzip(await this.fetchTarball(ref));
    const decoder = new TextDecoder();
    const out = new Map<string, string>();
    for (const e of parseTar(tar)) {
      const path = e.path.split("/").slice(1).join("/");
      if (!path || !isVaultNote(path)) continue;
      out.set(path, decoder.decode(e.data));
    }
    return out;
  }

  async listMarkdown(): Promise<TreeEntry[]> {
    const { data } = await this.octokit.rest.git.getTree({ ...this.base, tree_sha: this.branch, recursive: "true" });
    return data.tree
      .filter((e) => e.type === "blob" && e.path && isVaultNote(e.path))
      .map((e) => ({ path: e.path!, sha: e.sha! }));
  }

  async getFile(path: string, ref?: string): Promise<FileContent | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({ ...this.base, path, ref: ref ?? this.branch });
      if (Array.isArray(data) || data.type !== "file") return null;
      if (data.encoding !== "base64") throw new Error(`file too large for Contents API: ${path}`);
      const content = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
      return { path, content, sha: data.sha };
    } catch (e: any) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async searchCode(query: string): Promise<string[]> {
    const q = truncateSearchQuery(query);
    if (!q) return [];
    try {
      const { data } = await this.octokit.rest.search.code({ q: `${q} repo:${this.owner}/${this.repo} extension:md`, per_page: 30 });
      return data.items.map((i) => i.path).filter(isVaultNote);
    } catch (e: any) {
      // Code search is worth +1 on a relevance score; the tarball snapshot is the real source.
      // Whatever goes wrong here — an over-long query, a rate limit, an outage — degrading to no
      // hits is right, and failing the capture that asked for the check never is.
      console.warn("GitHub code search unavailable", e?.status ?? e);
      return [];
    }
  }

  async commitFiles(req: CommitRequest): Promise<{ sha: string; url: string }> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const ref = `heads/${this.branch}`;
      const headSha = (await this.octokit.rest.git.getRef({ ...this.base, ref })).data.object.sha;
      const baseTree = (await this.octokit.rest.git.getCommit({ ...this.base, commit_sha: headSha })).data.tree.sha;
      const files = req.prepare ? await req.prepare(headSha) : req.files;
      const tree = await Promise.all(files.map(async (f) => ({
        path: f.path, mode: "100644" as const, type: "blob" as const,
        sha: (await this.octokit.rest.git.createBlob({ ...this.base, content: toBase64(new TextEncoder().encode(f.content)), encoding: "base64" })).data.sha,
      })));
      const newTree = (await this.octokit.rest.git.createTree({ ...this.base, base_tree: baseTree, tree })).data.sha;
      const commit = (await this.octokit.rest.git.createCommit({ ...this.base, message: req.message, tree: newTree, parents: [headSha], author: COMMIT_AUTHOR, committer: COMMIT_AUTHOR })).data;
      try {
        await this.octokit.rest.git.updateRef({ ...this.base, ref, sha: commit.sha, force: false });
        return { sha: commit.sha, url: commit.html_url };
      } catch (e: any) {
        lastErr = e;
        if (e.status !== 422 && e.status !== 409) throw e;
      }
    }
    throw new Error(`commit failed after ${MAX_ATTEMPTS} attempts (concurrent writes): ${(lastErr as Error)?.message}`);
  }
}
