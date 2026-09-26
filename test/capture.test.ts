import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { capture, type CaptureDeps } from "../src/capture";
import { createDedupToken } from "../src/dedup";
import type { CaptureInput } from "../src/validate";
import { FakeOctokit, FakeVault } from "./fakes";
import { clearSnapshotCache } from "../src/snapshot";

const tpl = (n: string) => readFileSync(new URL(`./fixtures/templates/${n}.md`, import.meta.url), "utf8");
const NOW = new Date("2026-08-29T13:02:00Z");

beforeEach(() => clearSnapshotCache());

function setup() {
  const work = new FakeOctokit(); const personal = new FakeOctokit();
  for (const ok of [work, personal]) for (const t of ["Concept", "Project", "Area", "Source"]) ok.files.set(`90 System/Templates/${t}.md`, tpl(t));
  work.files.set("30 Resources/Annual capacity.md", "---\ntype: concept\ncreated: 2026-08-01\nupdated: 2026-08-01\n---\n\n# Annual capacity\n\n## Summary\n\nAnnual capacity is 1760 hours.\n");
  const deps: CaptureDeps = {
    clients: { work: new FakeVault(work, "work"), personal: new FakeVault(personal, "personal") },
    hmacSecret: "s", denylist: ["acme"], capturedBy: "test", now: () => NOW,
  };
  return { work, personal, deps };
}
const input = (o: Partial<CaptureInput> = {}): CaptureInput => ({
  vault: "work", type: "concept", title: "Soglia di pareggio make/buy", trigger: "auto", mode: "check",
  fields: { summary: "Il pareggio è a 1.285 ore.", sources: [{ kind: "conversation", ref: "Sessione 2026-08-29" }] }, ...o,
});

describe("capture", () => {
  it("check with no candidates writes a new inbox note", async () => {
    const { work, deps } = setup();
    const r = await capture(input(), deps);
    expect(r).toMatchObject({ status: "created", vault: "work", path: "00 Inbox/2026-08-29 1302 soglia-di-pareggio-make-buy.md" });
    const msg = work.commits.at(-1)!.message;
    expect(msg.split("\n")[0]).toBe("Add concept: Soglia di pareggio make/buy");
    expect(msg).toBe("Add concept: Soglia di pareggio make/buy\n\ncaptured_by: test\ntrigger: auto");
    expect(work.files.get((r as any).path)).toContain("Il pareggio è a 1.285 ore.");
  });
  it("check with candidates does not write and returns a token", async () => {
    const { work, deps } = setup();
    const before = work.commits.length;
    const r = await capture(input({ title: "Annual capacity", fields: { summary: "Annual capacity", sources: [{ kind: "url", ref: "x" }] } }), deps);
    expect(r.status).toBe("candidates");
    expect((r as any).candidates[0].path).toBe("30 Resources/Annual capacity.md");
    expect(typeof (r as any).dedup_token).toBe("string");
    expect(work.commits.length).toBe(before);
  });
  it("new with a valid token writes even when candidates exist", async () => {
    const { work, deps } = setup();
    const c = await capture(input({ title: "Annual capacity", fields: { summary: "Annual capacity", sources: [{ kind: "url", ref: "x" }] } }), deps) as any;
    const r = await capture(input({ title: "Annual capacity", mode: "new", dedup_token: c.dedup_token, fields: { summary: "Annual capacity", sources: [{ kind: "url", ref: "x" }] } }), deps);
    expect(r.status).toBe("created");
    expect(work.files.has((r as any).path)).toBe(true);
  });
  it("update appends a dated section and bumps updated", async () => {
    const { work, deps } = setup();
    const c = await capture(input({ title: "Annual capacity", fields: { summary: "Dato 2026", sources: [{ kind: "jira", ref: "TICKET-1" }] } }), deps) as any;
    const r = await capture(input({ title: "Annual capacity", mode: "update", dedup_token: c.dedup_token, target_path: "30 Resources/Annual capacity.md", fields: { summary: "Dato 2026", sources: [{ kind: "jira", ref: "TICKET-1" }] } }), deps);
    expect(r).toMatchObject({ status: "updated", path: "30 Resources/Annual capacity.md" });
    const md = work.files.get("30 Resources/Annual capacity.md")!;
    expect(md).toContain("updated: 2026-08-29");
    expect(md).toContain("Annual capacity is 1760 hours.");            // body preserved
    expect(md).toMatch(/## Update 2026-08-29\n\nDato 2026/);
    expect(work.commits.at(-1)!.message).toMatch(/^Update concept: Annual capacity\n\ncaptured_by: test\ntrigger: auto$/);
  });
  it("rejects an invalid token", async () => {
    const { deps } = setup();
    await expect(capture(input({ mode: "new", dedup_token: "bad.token" }), deps)).rejects.toThrow(/bad signature|malformed/);
  });
  it("explicit trigger writes to the PARA folder and refuses to overwrite in mode check", async () => {
    const { work, deps } = setup();
    const r = await capture(input({ trigger: "explicit", title: "Nuovo concetto", type: "concept" }), deps);
    expect((r as any).path).toBe("30 Resources/Nuovo concetto.md");
    // something unrelated already occupies the target path, so dedup does not flag it first
    work.externalWrite("30 Resources/Altro titolo.md", "---\ntype: concept\n---\n\n# Tutt'altro argomento\n\nCorpo scollegato.\n");
    await expect(
      capture(input({ trigger: "explicit", title: "Altro titolo", type: "concept" }), deps)
    ).rejects.toThrow(/already exists/);
    expect(work.files.has("30 Resources/Nuovo concetto.md")).toBe(true);
  });
  it("explicit mode \"new\" files a repeated title alongside instead of stranding it", async () => {
    const { work, deps } = setup();
    const c = await capture(input({ title: "Annual capacity" }), deps) as any; // check → candidates + real token
    const r = await capture(input({ trigger: "explicit", mode: "new", dedup_token: c.dedup_token, title: "Annual capacity" }), deps);
    // the caller has already answered "not a duplicate": suffix, never overwrite, never refuse
    expect(r).toMatchObject({ status: "created", path: "30 Resources/Annual capacity-2.md" });
    expect(work.files.get("30 Resources/Annual capacity.md")).toContain("Annual capacity is 1760 hours.");
  });
  it("does not treat an earlier Telegram capture as a duplicate of an unrelated one", async () => {
    const { work, deps } = setup();
    // a note the bot itself wrote: provenance tags, and "telegram" inside the source ref
    work.files.set("00 Inbox/2026-08-30 0152 ciao.md",
      "---\ntype: source\ncreated: 2026-08-30\ntags: [telegram, auto, vault-work]\ncaptured_by: telegram\ntrigger: auto\n---\n\n# ciao\n\n## Source\n\n- conversation: telegram:1:2\n\n## Key points\n\nciao\n");
    work.searchResults = ["00 Inbox/2026-08-30 0152 ciao.md"]; // code search matches it too
    const text = "ho creato un bot telegram per il mio second brain";
    const r = await capture(input({
      trigger: "auto", title: text,
      fields: { summary: text, sources: [{ kind: "conversation", ref: "telegram:1:9" }], tags: ["telegram", "auto", "vault-work"] },
    }), deps);
    expect(r.status).toBe("created");
  });
  it("falls back to the source template when the type's template is missing, and says so", async () => {
    const { work, deps } = setup();
    work.files.delete("90 System/Templates/Concept.md");
    const r = await capture(input(), deps) as any;
    expect(r.status).toBe("created");
    expect(r.warning).toMatch(/Concept\.md not found.*saved as a source note/);
    // it really is a source note now: the source template's own sections, and type in frontmatter
    expect(work.files.get(r.path)).toContain("## Key points");
    expect(work.files.get(r.path)).toContain("type: source");
  });
  it("fails clearly when even the source template is missing", async () => {
    const { work, deps } = setup();
    work.files.delete("90 System/Templates/Concept.md");
    work.files.delete("90 System/Templates/Source.md");
    await expect(capture(input(), deps)).rejects.toThrow(/template Concept\.md not found in 90 System\/Templates/);
  });
  it("sends an explicit capture to the inbox when the channel asks for it", async () => {
    const { deps } = setup();
    const base = { trigger: "explicit" as const, destination: "inbox" as const, title: "Cattura dal telefono" };
    const r = await capture(input(base), deps) as any;
    expect(r.path).toBe("00 Inbox/2026-08-29 1302 cattura-dal-telefono.md");
    // the same capture forced through again suffixes instead of erroring: the inbox never refuses one
    const c = await capture(input(base), deps) as any;
    expect(c.status).toBe("candidates");
    const again = await capture(input({ ...base, mode: "new", dedup_token: c.dedup_token }), deps) as any;
    expect(again.path).toBe("00 Inbox/2026-08-29 1302 cattura-dal-telefono-2.md");
  });
  it("survives a long summary, which used to blow past GitHub's search query limit", async () => {
    const { work, deps } = setup();
    // GitHub rejects a query over 256 characters; reported from the field as a capture that
    // failed outright with "query exceeds max length" instead of just losing the code-search hit
    work.rest.search.code = async ({ q }: any) => {
      if (q.length > 256) { const e: any = new Error("query exceeds max length"); e.status = 414; throw e; }
      return { data: { items: [] } };
    };
    const summary = "Ripartizione delle spese condivise annualizzate, con quote personali e scostamenti rispetto al target. ".repeat(8);
    const r = await capture(input({ title: "Spese condivise e ripartizione familiare", fields: { summary, sources: [{ kind: "conversation", ref: "chat" }] } }), deps);
    expect(r.status).toBe("created");
    expect(work.files.get((r as any).path)).toContain("Ripartizione delle spese condivise");
  });
  it("blocks denylisted content into personal", async () => {
    const { deps } = setup();
    await expect(capture(input({ vault: "personal", fields: { summary: "con ACME", sources: [{ kind: "url", ref: "x" }] } }), deps)).rejects.toThrow(/cannot enter personal/);
  });
  it("rejects update whose target_path was not among the token's candidates", async () => {
    const { deps } = setup();
    const c = await capture(input({ title: "Annual capacity", fields: { summary: "Annual capacity", sources: [{ kind: "url", ref: "x" }] } }), deps) as any;
    await expect(
      capture(input({ title: "Annual capacity", mode: "update", dedup_token: c.dedup_token, target_path: "30 Resources/Some Other Note.md" }), deps)
    ).rejects.toThrow(/not among the candidates/);
  });
  it("rejects update against a candidate path that no longer exists", async () => {
    const { work, deps } = setup();
    const c = await capture(input({ title: "Annual capacity", fields: { summary: "Annual capacity", sources: [{ kind: "url", ref: "x" }] } }), deps) as any;
    work.files.delete("30 Resources/Annual capacity.md");
    await expect(
      capture(input({ title: "Annual capacity", mode: "update", dedup_token: c.dedup_token, target_path: "30 Resources/Annual capacity.md" }), deps)
    ).rejects.toThrow(/does not exist/);
  });
  it("rejects a target_path pointing into a system directory", async () => {
    const { deps } = setup();
    const token = await createDedupToken(deps.hmacSecret, {
      vault: "work", title: "Annual capacity", candidates: ["90 System/Templates/Concept.md"], now: NOW,
    });
    await expect(
      capture(input({ title: "Annual capacity", mode: "update", dedup_token: token, target_path: "90 System/Templates/Concept.md" }), deps)
    ).rejects.toThrow(/bad_target|system directory|target_path/);
  });
});

describe("capture update preserves user frontmatter", () => {
  it("keeps block-style tags, comments and quoting byte-for-byte", async () => {
    const { work, deps } = setup();
    const original = `---
type: concept
tags:
  - "quoted tag"
  - costi
# nota per me
updated: 2026-08-01
---

# Annual capacity

## Summary

Annual capacity is 1760 hours.
`;
    work.files.set("30 Resources/Annual capacity.md", original);
    const c = await capture(input({ title: "Annual capacity", fields: { summary: "Dato 2026", sources: [{ kind: "jira", ref: "TICKET-1" }] } }), deps) as any;
    await capture(input({ title: "Annual capacity", mode: "update", dedup_token: c.dedup_token, target_path: "30 Resources/Annual capacity.md", fields: { summary: "Dato 2026", sources: [{ kind: "jira", ref: "TICKET-1" }] } }), deps);
    const md = work.files.get("30 Resources/Annual capacity.md")!;
    const expectedFm = original.slice(0, original.indexOf("\n---\n", 3) + 5).replace("updated: 2026-08-01", "updated: 2026-08-29");
    expect(md.startsWith(expectedFm)).toBe(true);
    expect(md).toContain('  - "quoted tag"');
    expect(md).toContain("# nota per me");
    expect(md).toMatch(/## Update 2026-08-29\n\nDato 2026/);
  });
  it("inserts updated when the note has none", async () => {
    const { work, deps } = setup();
    work.files.set("30 Resources/Annual capacity.md", "---\ntype: concept\n---\n\n# Annual capacity\n\nAnnual capacity.\n");
    const c = await capture(input({ title: "Annual capacity", fields: { summary: "Dato", sources: [{ kind: "jira", ref: "TICKET-1" }] } }), deps) as any;
    await capture(input({ title: "Annual capacity", mode: "update", dedup_token: c.dedup_token, target_path: "30 Resources/Annual capacity.md", fields: { summary: "Dato", sources: [{ kind: "jira", ref: "TICKET-1" }] } }), deps);
    expect(work.files.get("30 Resources/Annual capacity.md")!.startsWith("---\ntype: concept\nupdated: 2026-08-29\n---\n")).toBe(true);
  });
});

describe("auto capture collisions", () => {
  it("suffixes instead of overwriting a same-minute same-slug inbox note", async () => {
    const { work, deps } = setup();
    const first = await capture(input(), deps) as any;
    expect(first.path).toBe("00 Inbox/2026-08-29 1302 soglia-di-pareggio-make-buy.md");
    const c = await capture(input(), deps) as any;               // now finds the note it just wrote
    expect(c.status).toBe("candidates");
    const second = await capture(input({ mode: "new", dedup_token: c.dedup_token }), deps) as any;
    expect(second.path).toBe("00 Inbox/2026-08-29 1302 soglia-di-pareggio-make-buy-2.md");
    expect(work.files.has(first.path)).toBe(true);
    expect(work.files.has(second.path)).toBe(true);
  });
  it("gives up after 20 suffixes", async () => {
    const { work, deps } = setup();
    const base = "00 Inbox/2026-08-29 1302 soglia-di-pareggio-make-buy";
    work.files.set(`${base}.md`, "x");
    for (let i = 2; i <= 20; i++) work.files.set(`${base}-${i}.md`, "x");
    const c = await capture(input(), deps) as any;
    await expect(capture(input({ mode: "new", dedup_token: c.dedup_token }), deps)).rejects.toThrow(/exists/);
  });
});
