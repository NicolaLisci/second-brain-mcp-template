import { beforeEach, describe, expect, it } from "vitest";
import { searchVault, tokenize, CANDIDATE_THRESHOLD } from "../src/search";
import { FakeOctokit, FakeVault } from "./fakes";
import { clearSnapshotCache } from "../src/snapshot";

const note = (title: string, tags: string[], body: string) => `---\ntype: concept\ntags: [${tags.join(", ")}]\n---\n\n# ${title}\n\n${body}\n`;

function setup() {
  const ok = new FakeOctokit();
  ok.files.set("30 Resources/Tariffe orarie interne.md", note("Tariffe orarie interne", ["costi"], "Le tariffe confermate come costo interno. Vedi [[Annual capacity]]."));
  ok.files.set("30 Resources/Annual capacity.md", note("Annual capacity", ["costi", "capacity"], "Annual capacity is 1760 hours."));
  ok.files.set("10 Projects/Make or buy.md", note("Make or buy", [], "Soglia di pareggio a 1.285 ore."));
  ok.files.set("00 Inbox/rumore.md", note("Nota casuale", [], "Niente di rilevante."));
  return { ok, vault: new FakeVault(ok, "work") };
}

beforeEach(() => clearSnapshotCache());

describe("tokenize", () => {
  it("normalizes, drops short tokens and stopwords", () => {
    expect(tokenize("Le tariffe orarie di ExampleCo e il capacity")).toEqual(["tariffe", "orarie", "exampleco", "capacity"]);
  });
});

describe("searchVault", () => {
  it("scores title matches highest and marks them as candidates", async () => {
    const { vault } = setup();
    const r = await searchVault(vault, "tariffe orarie", 10);
    expect(r[0].path).toBe("30 Resources/Tariffe orarie interne.md");
    expect(r[0].score).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
    expect(r[0]).toMatchObject({ vault: "work", title: "Tariffe orarie interne", type: "concept" });
    expect(r[0].excerpt).toContain("tariffe confermate");
  });
  it("uses code search results when available", async () => {
    const { ok, vault } = setup();
    ok.searchResults = ["10 Projects/Make or buy.md"];
    const r = await searchVault(vault, "pareggio", 10);
    expect(r.map((x) => x.path)).toContain("10 Projects/Make or buy.md");
  });
  it("falls back to scanning bodies when code search is empty", async () => {
    const { vault } = setup();
    const r = await searchVault(vault, "pareggio", 10);
    expect(r[0].path).toBe("10 Projects/Make or buy.md");
  });
  it("expands one hop through wikilinks", async () => {
    const { vault } = setup();
    const r = await searchVault(vault, "tariffe orarie", 10);
    expect(r.map((x) => x.path)).toContain("30 Resources/Annual capacity.md");
  });
  it("resolves wikilinks by filename stem, not just H1 title", async () => {
    const { ok, vault } = setup();
    ok.files.set("30 Resources/Soglia make-buy.md", note("Soglia di pareggio", [], "Dettaglio interno."));
    ok.files.set("30 Resources/Tariffe orarie interne.md", note("Tariffe orarie interne", ["costi"], "Le tariffe confermate come costo interno. Vedi [[Annual capacity]] e [[Soglia make-buy]]."));
    const r = await searchVault(vault, "tariffe orarie", 10);
    const hop = r.find((x) => x.path === "30 Resources/Soglia make-buy.md");
    expect(hop).toBeDefined();
    expect(hop!.score).toBe(0.5);
  });
  it("respects limit and excludes zero-score notes", async () => {
    const { vault } = setup();
    const r = await searchVault(vault, "tariffe orarie", 1);
    expect(r).toHaveLength(1);
    expect((await searchVault(vault, "tariffe", 10)).map((x) => x.path)).not.toContain("00 Inbox/rumore.md");
  });
});

describe("vault snapshot cache", () => {
  it("loads the vault once per head sha", async () => {
    const { vault } = setup();
    await searchVault(vault, "tariffe orarie", 10);
    await searchVault(vault, "pareggio", 10);
    expect(vault.tarballFetches).toBe(1);
  });
  it("reloads when someone else commits", async () => {
    const { ok, vault } = setup();
    await searchVault(vault, "tariffe orarie", 10);
    ok.externalWrite("30 Resources/Nuova.md", note("Nuova nota", [], "Contenuto sul pareggio."));
    const r = await searchVault(vault, "pareggio", 10);
    expect(vault.tarballFetches).toBe(2);
    expect(r.map((x) => x.path)).toContain("30 Resources/Nuova.md");
  });
  it("does not fetch one file per note", async () => {
    const { ok, vault } = setup();
    let getContentCalls = 0;
    const orig = ok.rest.repos.getContent;
    ok.rest.repos.getContent = async (p: any) => { getContentCalls++; return orig(p); };
    await searchVault(vault, "tariffe orarie", 10);
    expect(getContentCalls).toBe(0);
  });
});

describe("scoring weights", () => {
  const scoreOf = (r: Awaited<ReturnType<typeof searchVault>>, path: string) => r.find((x) => x.path === path)?.score;

  it("scores a tag-only match 2", async () => {
    const { ok, vault } = setup();
    ok.files.set("30 Resources/Glossario.md", note("Glossario", ["budget"], "Definizioni varie."));
    expect(scoreOf(await searchVault(vault, "budget", 10), "30 Resources/Glossario.md")).toBe(2);
  });
  it("counts an inflected body match, so a tag hit and a body hit make 4", async () => {
    const { vault } = setup();
    // "costi" and "costo" are the same word: the vault is written in Italian, and matching only
    // exact tokens is what kept the note holding an answer from surfacing at all.
    expect(scoreOf(await searchVault(vault, "costi", 10), "30 Resources/Tariffe orarie interne.md")).toBe(4);
  });
  it("scores a body-only match 2", async () => {
    const { vault } = setup();
    expect(scoreOf(await searchVault(vault, "pareggio", 10), "10 Projects/Make or buy.md")).toBe(2);
  });
  it("scores body + code search hit 3, reaching the candidate threshold", async () => {
    const { ok, vault } = setup();
    ok.searchResults = ["10 Projects/Make or buy.md"];
    const s = scoreOf(await searchVault(vault, "pareggio", 10), "10 Projects/Make or buy.md");
    expect(s).toBe(3);
    expect(s).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
  });
  it("scores a title-only match 3", async () => {
    const { ok, vault } = setup();
    // no H1: the title comes from the filename, so the body cannot match it too
    ok.files.set("30 Resources/Glossario interno.md", "---\ntype: concept\n---\n\nContenuto vario.\n");
    expect(scoreOf(await searchVault(vault, "glossario interno", 10), "30 Resources/Glossario interno.md")).toBe(3);
  });
  it("adds the body weight on top of the title weight", async () => {
    const { vault } = setup();
    expect(scoreOf(await searchVault(vault, "tariffe orarie", 10), "30 Resources/Tariffe orarie interne.md")).toBe(5);
  });
  it("still scans bodies when code search returned hits", async () => {
    const { ok, vault } = setup();
    ok.searchResults = ["30 Resources/Annual capacity.md"]; // an unrelated code hit must not suppress the body scan
    const r = await searchVault(vault, "pareggio", 10);
    expect(scoreOf(r, "10 Projects/Make or buy.md")).toBe(2);
  });
});

describe("relevance guards", () => {
  const scoreOf = (r: Awaited<ReturnType<typeof searchVault>>, path: string) => r.find((x) => x.path === path)?.score;

  it("ignores provenance tags, which every capture carries", async () => {
    const { ok, vault } = setup();
    ok.files.set("00 Inbox/cattura.md", note("Cattura", ["telegram", "auto", "vault-work"], "Contenuto qualsiasi."));
    const r = await searchVault(vault, "telegram", 10);
    expect(r.map((x) => x.path)).not.toContain("00 Inbox/cattura.md");
  });
  it("still scores a real topic tag", async () => {
    const { ok, vault } = setup();
    ok.files.set("00 Inbox/cattura.md", note("Cattura", ["telegram", "costi"], "Contenuto qualsiasi."));
    expect(scoreOf(await searchVault(vault, "costi", 10), "00 Inbox/cattura.md")).toBe(2);
  });
  it("matches whole words, not substrings", async () => {
    const { ok, vault } = setup();
    ok.files.set("30 Resources/Cella robotica.md", note("Cella robotica", [], "Il robot preleva la provetta."));
    const r = await searchVault(vault, "bot", 10);
    expect(r.map((x) => x.path)).not.toContain("30 Resources/Cella robotica.md");
  });
  it("scores one shared word out of many as 1, below the duplicate threshold even with a code hit", async () => {
    const { ok, vault } = setup();
    ok.searchResults = ["10 Projects/Make or buy.md"];
    const q = "pareggio delle competenze in un contesto totalmente diverso";
    const s = scoreOf(await searchVault(vault, q, 10), "10 Projects/Make or buy.md");
    expect(s).toBe(2); // 1 partial body + 1 code hit
    expect(s).toBeLessThan(CANDIDATE_THRESHOLD);
  });
});

describe("excerpt and passage", () => {
  // the shape that produced the bug: the answer sits under a heading, several lines acapacityr the
  // first line that merely mentions one of the query words
  const nota = `---\ntype: concept\n---\n\n# Spese condivise\n\n## Facts\n\n- \`Foglio1\` contiene i dati originali delle spese ed è la fonte di verità.\n- Non modificare mai \`Foglio1\`.\n\n### Quote mensili personali\n\n- Alex: 890,50 € / mese.\n- Jordan: 593,67 € / mese.\n`;

  async function excerptFor(query: string) {
    const { ok, vault } = setup();
    ok.files.set("00 Inbox/Spese condivise.md", nota);
    const r = await searchVault(vault, query, 10);
    return r.find((x) => x.path === "00 Inbox/Spese condivise.md")!;
  }

  it("shows the lines that answer, not the first line that merely matches a word", async () => {
    const hit = await excerptFor("quota mensile");
    expect(hit.excerpt).toContain("890,50");
    expect(hit.excerpt).not.toContain("Foglio1");
  });
  it("keeps the heading above the passage, as the context it is", async () => {
    expect((await excerptFor("quota mensile")).excerpt).toContain("Quote mensili personali");
  });
  it("matches Italian inflections when picking the passage, but not when scoring", async () => {
    // "quota" finds "Quote", "mensile" finds "mensili" — neither is an exact token
    expect((await excerptFor("quota mensile")).excerpt).toContain("Quote mensili");
    // scoring stays exact: it is what keeps the dedup from calling everything a duplicate
    expect(tokenize("quota mensile")).toEqual(["quota", "mensile"]);
  });
  it("gives the model more room than the human excerpt", async () => {
    const hit = await excerptFor("quota mensile");
    expect(hit.passage.length).toBeGreaterThanOrEqual(hit.excerpt.length);
    expect(hit.passage).toContain("593,67");
  });
  it("falls back to the opening lines when nothing matches", async () => {
    const hit = await excerptFor("argomento del tutto estraneo");
    expect(hit?.excerpt ?? "").not.toContain("undefined");
  });
});

describe("coverage: what is worth showing a human", () => {
  const cov = (r: Awaited<ReturnType<typeof searchVault>>, path: string) => r.find((x) => x.path === path)?.coverage;

  it("is zero for a note pulled in only by a wikilink", async () => {
    const { vault } = setup();
    // "Annual capacity" is linked from the note that matched, and shares nothing with the query itself
    const r = await searchVault(vault, "tariffe orarie", 10);
    expect(cov(r, "30 Resources/Annual capacity.md")).toBe(0);
    expect(cov(r, "30 Resources/Tariffe orarie interne.md")).toBe(1);
  });
  it("weights a rare word far above a common one", async () => {
    const { ok, vault } = setup();
    // "costi" is in two notes, "pareggio" in one: sharing only the rare word carries more question
    for (let i = 0; i < 6; i++) ok.files.set(`30 Resources/filler ${i}.md`, note(`Filler ${i}`, ["costi"], "Testo di riempimento."));
    const r = await searchVault(vault, "costi pareggio", 20);
    expect(cov(r, "10 Projects/Make or buy.md")!).toBeGreaterThan(0.5);   // has the rare one
    expect(cov(r, "30 Resources/filler 0.md")!).toBeLessThan(0.5);        // has the common one
  });
  it("ignores function words on both sides", async () => {
    const { ok, vault } = setup();
    ok.files.set("30 Resources/Rumore.md", note("Rumore", [], "Questo è quanto viene fatto ogni mese."));
    // the only words the note shares with the query are function words
    const r = await searchVault(vault, "quanto viene fatto per il pareggio", 10);
    expect(cov(r, "30 Resources/Rumore.md") ?? 0).toBe(0);
    expect(cov(r, "10 Projects/Make or buy.md")).toBe(1);
  });
});
