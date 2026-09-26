import { describe, expect, it } from "vitest";
import { GitHubVault, COMMIT_AUTHOR, MAX_SEARCH_QUERY, toBase64, truncateSearchQuery } from "../src/github";
import { FakeOctokit, FakeVault } from "./fakes";

function setup() {
  const ok = new FakeOctokit();
  ok.files.set("00 Inbox/a.md", "# A");
  ok.files.set(".obsidian/app.json", "{}");
  ok.files.set("30 Resources/b.md", "# B");
  ok.files.set("Attachments/img.png", "bin");
  ok.files.set("90 System/Templates/Concept.md", "# Template");
  return { ok, vault: new GitHubVault(ok as any, "work") };
}

describe("GitHubVault", () => {
  it("lists markdown files excluding .obsidian", async () => {
    const { vault } = setup();
    expect((await vault.listMarkdown()).map((e) => e.path).sort()).toEqual(["00 Inbox/a.md", "30 Resources/b.md"]);
  });
  it("excludes 90 System/ (templates/MOC scaffolding are not knowledge for search)", async () => {
    const { vault } = setup();
    const paths = (await vault.listMarkdown()).map((e) => e.path);
    expect(paths).not.toContain("90 System/Templates/Concept.md");
  });
  it("excludes root-level system files (AGENTS.md, CLAUDE.md, README.md, Home.md) but keeps a same-named file in a folder", async () => {
    const { ok, vault } = setup();
    ok.files.set("AGENTS.md", "# Agents");
    ok.files.set("CLAUDE.md", "# Claude");
    ok.files.set("README.md", "# Readme");
    ok.files.set("Home.md", "# Home");
    ok.files.set("30 Resources/README.md", "# Nested readme");
    const paths = (await vault.listMarkdown()).map((e) => e.path);
    expect(paths).not.toContain("AGENTS.md");
    expect(paths).not.toContain("CLAUDE.md");
    expect(paths).not.toContain("README.md");
    // the vault landing page is navigation, not knowledge: never a search hit or a dedup candidate
    expect(paths).not.toContain("Home.md");
    expect(paths).toContain("30 Resources/README.md");
  });
  it("gets a file decoded from base64, null when missing", async () => {
    const { vault } = setup();
    expect(await vault.getFile("30 Resources/b.md")).toMatchObject({ path: "30 Resources/b.md", content: "# B" });
    expect(await vault.getFile("nope.md")).toBeNull();
  });
  it("returns [] when code search is unavailable, whatever went wrong", async () => {
    const { ok, vault } = setup();
    // 414 is what an over-long query actually produced, and it used to be rethrown and fail the
    // capture that asked for the duplicate check
    for (const status of [422, 403, 404, 414, 500]) {
      ok.searchError = status;
      expect(await vault.searchCode("x")).toEqual([]);
    }
    ok.searchError = null; ok.searchResults = ["30 Resources/b.md"];
    expect(await vault.searchCode("B")).toEqual(["30 Resources/b.md"]);
  });
  it("never sends GitHub a query longer than it accepts", async () => {
    const { ok, vault } = setup();
    let sent = "";
    ok.rest.search.code = async ({ q }: any) => { sent = q; return { data: { items: [] } }; };
    const summary = "Analisi delle spese condivise annualizzate e della ripartizione familiare ".repeat(12);
    await vault.searchCode(`Spese condivise e ripartizione familiare ${summary}`);
    const terms = sent.replace(/ repo:\S+ extension:md$/, "");
    expect(terms.length).toBeLessThanOrEqual(MAX_SEARCH_QUERY);
    expect(sent.length).toBeLessThan(256);          // GitHub's own cap, qualifiers included
    expect(terms.endsWith(" ")).toBe(false);        // cut on a word boundary, not mid-word
    expect(terms.startsWith("Spese condivise")).toBe(true);
  });
  it("skips the request entirely for an empty query", async () => {
    const { ok, vault } = setup();
    let called = 0;
    ok.rest.search.code = async () => { called++; return { data: { items: [] } }; };
    expect(await vault.searchCode("   ")).toEqual([]);
    expect(called).toBe(0);
  });
  it("commits files atomically with the configured author and message", async () => {
    const { ok, vault } = setup();
    const r = await vault.commitFiles({ message: "Add concept: X", files: [{ path: "00 Inbox/x.md", content: "# X" }] });
    expect(r.sha).toMatch(/^commit-/);
    expect(ok.commits.at(-1)).toMatchObject({ message: "Add concept: X", files: { "00 Inbox/x.md": "# X" }, author: COMMIT_AUTHOR });
    expect(ok.files.get("00 Inbox/x.md")).toBe("# X");
  });
  it("retries on non-fast-forward, re-running prepare against the new head", async () => {
    const { ok, vault } = setup();
    ok.raceOnce = () => ok.externalWrite("30 Resources/b.md", "# B\nchanged by someone else");
    const seen: string[] = [];
    await vault.commitFiles({
      message: "Update concept: B",
      files: [],
      prepare: async (head) => { seen.push(head); const cur = (await vault.getFile("30 Resources/b.md", head))!.content; return [{ path: "30 Resources/b.md", content: `${cur}\n## Update` }]; },
    });
    expect(seen).toHaveLength(2);
    expect(ok.files.get("30 Resources/b.md")).toBe("# B\nchanged by someone else\n## Update");
  });
  it("gives up after 3 attempts", async () => {
    const { ok, vault } = setup();
    let n = 0;
    ok.rest.git.updateRef = async () => { n++; const e: any = new Error("Update is not a fast forward"); e.status = 422; throw e; };
    await expect(vault.commitFiles({ message: "m", files: [{ path: "x.md", content: "x" }] })).rejects.toThrow(/after 3 attempts/);
    expect(n).toBe(3);
  });
  it("commits large (>100KB) content without RangeError, round-tripping through the fake", async () => {
    const { ok, vault } = setup();
    const big = "à".repeat(200_000); // ~400KB UTF-8
    await vault.commitFiles({ message: "Add big note", files: [{ path: "30 Resources/big.md", content: big }] });
    expect(ok.files.get("30 Resources/big.md")).toBe(big);
  });
});

describe("toBase64", () => {
  it("matches a known-correct base64 encoding", () => {
    const text = "ciao è €";
    expect(toBase64(new TextEncoder().encode(text))).toBe(Buffer.from(text, "utf8").toString("base64"));
  });
});

describe("GitHubVault.loadAll", () => {
  it("reads the whole vault from one tarball, filtering the same way as listMarkdown", async () => {
    const { ok } = setup();
    const vault = new FakeVault(ok, "work");
    expect(await vault.headSha()).toBe(ok.head);
    const all = await vault.loadAll(await vault.headSha());
    expect([...all.keys()].sort()).toEqual(["00 Inbox/a.md", "30 Resources/b.md"]);
    expect(all.get("30 Resources/b.md")).toBe("# B");
    expect(vault.tarballFetches).toBe(1);
  });
  it("decodes UTF-8 content", async () => {
    const { ok } = setup();
    ok.files.set("30 Resources/accenti.md", "# Città\n\nperò è così\n");
    const all = await new FakeVault(ok, "work").loadAll("x");
    expect(all.get("30 Resources/accenti.md")).toBe("# Città\n\nperò è così\n");
  });
  it("excludes root-level system files but keeps a same-named file nested in a folder", async () => {
    const { ok } = setup();
    ok.files.set("AGENTS.md", "# Agents");
    ok.files.set("CLAUDE.md", "# Claude");
    ok.files.set("README.md", "# Readme");
    ok.files.set("Home.md", "# Home");
    ok.files.set("30 Resources/README.md", "# Nested readme");
    const all = await new FakeVault(ok, "work").loadAll("x");
    expect([...all.keys()].sort()).toEqual([
      "00 Inbox/a.md",
      "30 Resources/README.md",
      "30 Resources/b.md",
    ]);
  });
});

describe("GitHubVault.getFile size limit", () => {
  it("throws instead of returning an empty note when the Contents API refuses to inline the blob", async () => {
    const { ok, vault } = setup();
    ok.rest.repos.getContent = async ({ path }: any) => ({ data: { type: "file", encoding: "none", content: "", sha: "s", path } });
    await expect(vault.getFile("30 Resources/b.md")).rejects.toThrow(/too large for Contents API: 30 Resources\/b\.md/);
  });
});

describe("truncateSearchQuery", () => {
  it("leaves a short query untouched", () => {
    expect(truncateSearchQuery("quota spese mensili")).toBe("quota spese mensili");
  });
  it("collapses whitespace, so newlines in a summary do not inflate the length", () => {
    expect(truncateSearchQuery("  quota\n\nspese   mensili  ")).toBe("quota spese mensili");
  });
  it("cuts at the last word boundary within the budget", () => {
    expect(truncateSearchQuery("alfa beta gamma delta", 12)).toBe("alfa beta");
  });
  it("cuts mid-word rather than return almost nothing", () => {
    // one long token: a word boundary at the very start would throw the query away
    expect(truncateSearchQuery("a supercalifragilisticexpialidocious", 10)).toBe("a supercal");
  });
});
