import { GitHubVault } from "../src/github";
import type { VaultId } from "../src/config";
import { vaultTarball } from "./tarbuild";

export class FakeOctokit {
  files = new Map<string, string>();       // path → content at HEAD
  head = "sha-0";
  commits: { message: string; files: Record<string, string>; author?: any }[] = [];
  searchResults: string[] = [];
  searchError: number | null = null;
  /** if set, called once right before the first updateRef to simulate a concurrent writer */
  raceOnce: (() => void) | null = null;
  private blobs = new Map<string, string>();
  private trees = new Map<string, { path: string; sha: string }[]>();
  private pendingCommits = new Map<string, { tree: string; message: string; author?: any; parent?: string }>();
  private n = 0;
  private id = (p: string) => `${p}-${++this.n}`;

  private err(status: number, message = "") { const e: any = new Error(message || `HTTP ${status}`); e.status = status; return e; }

  rest = {
    git: {
      getRef: async () => ({ data: { object: { sha: this.head } } }),
      getCommit: async ({ commit_sha }: any) => ({ data: { tree: { sha: `tree-of-${commit_sha}` } } }),
      getTree: async () => this.listTree(),
      createBlob: async ({ content, encoding }: any) => {
        const text = encoding === "base64" ? Buffer.from(content, "base64").toString("utf8") : content;
        const sha = this.id("blob"); this.blobs.set(sha, text); return { data: { sha } };
      },
      createTree: async ({ tree }: any) => { const sha = this.id("tree"); this.trees.set(sha, tree); return { data: { sha } }; },
      createCommit: async ({ message, tree, author, parents }: any) => { const sha = this.id("commit"); this.pendingCommits.set(sha, { tree, message, author, parent: parents[0] }); return { data: { sha, html_url: `https://github.com/x/y/commit/${sha}` } }; },
      updateRef: async ({ sha, force }: any) => {
        if (this.raceOnce) { const r = this.raceOnce; this.raceOnce = null; r(); }
        const c = this.pendingCommits.get(sha)!;
        // the commit's parent must be current head (CAS): we recorded parent via createCommit's caller; emulate by checking a marker
        if ((c as any).parent !== undefined && (c as any).parent !== this.head && !force) throw this.err(422, "Update is not a fast forward");
        const files: Record<string, string> = {};
        for (const e of this.trees.get(c.tree)!) { const content = this.blobs.get(e.sha)!; this.files.set(e.path, content); files[e.path] = content; }
        this.commits.push({ message: c.message, files, author: c.author });
        this.head = sha;
        return { data: {} };
      },
    },
    repos: {
      getContent: async ({ path }: any) => {
        if (path === "") return { data: [] };
        const content = this.files.get(path);
        if (content === undefined) throw this.err(404);
        return { data: { type: "file", encoding: "base64", content: Buffer.from(content, "utf8").toString("base64"), sha: `sha-${path}`, path } };
      },
    },
    search: { code: async (_p?: any) => { if (this.searchError) throw this.err(this.searchError); return { data: { items: this.searchResults.map((path) => ({ path })) } }; } },
  };

  /** Recursive tree listing used by listMarkdown */
  listTree = async () => ({ data: { tree: [...this.files.keys()].map((path) => ({ path, type: "blob", sha: `sha-${path}` })) } });

  /** test helper: simulate someone else committing */
  externalWrite(path: string, content: string) { this.files.set(path, content); this.head = this.id("sha-ext"); }
}

/** GitHubVault wired to a FakeOctokit, with the tarball fetch served from `ok.files`. */
export class FakeVault extends GitHubVault {
  tarballFetches = 0;
  constructor(private ok: FakeOctokit, vault: VaultId) { super(ok as any, vault); }
  protected async fetchTarball(_ref: string): Promise<Uint8Array> {
    this.tarballFetches++;
    return vaultTarball(this.ok.files);
  }
}
