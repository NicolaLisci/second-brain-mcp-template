import { beforeEach, describe, expect, it } from "vitest";
import { resolveRelated, vaultContext } from "../src/vault-context";
import { clearSnapshotCache } from "../src/snapshot";
import { FakeOctokit, FakeVault } from "./fakes";

const note = (title: string, tags: string[], body: string) => `---\ntype: concept\ntags: [${tags.join(", ")}]\n---\n\n# ${title}\n\n${body}\n`;

function setup() {
  const ok = new FakeOctokit();
  ok.files.set("30 Resources/Tariffe orarie interne.md", note("Tariffe orarie interne", ["costi", "telegram"], "Le tariffe confermate come costo interno."));
  ok.files.set("30 Resources/Un FTE.md", note("Un FTE", ["costi", "fte"], "1 FTE = 1760 h/anno."));
  // filename and H1 deliberately differ: Obsidian resolves [[..]] against the filename
  ok.files.set("30 Resources/Soglia make-buy.md", note("Soglia di pareggio", ["costi"], "Pareggio a 1.285 ore."));
  ok.files.set("00 Inbox/rumore.md", note("Nota casuale", ["auto", "vault-work"], "Niente di rilevante."));
  return { ok, vault: new FakeVault(ok, "work") };
}

beforeEach(() => clearSnapshotCache());

describe("vaultContext", () => {
  it("returns the nearby note titles for the message", async () => {
    const { vault } = setup();
    const ctx = await vaultContext(vault, "tariffe orarie");
    expect(ctx.titles).toContain("Tariffe orarie interne");
    expect(ctx.titles).not.toContain("Nota casuale");
  });
  it("returns the tag vocabulary by frequency, without the provenance tags", async () => {
    const { vault } = setup();
    const ctx = await vaultContext(vault, "tariffe");
    expect(ctx.tags[0]).toBe("costi"); // the most used one leads
    expect(ctx.tags).toContain("fte");
    // these say where a note came from, not what it is about: they would poison the vocabulary
    expect(ctx.tags).not.toContain("telegram");
    expect(ctx.tags).not.toContain("auto");
    expect(ctx.tags).not.toContain("vault-work");
  });
  it("degrades to empty instead of failing the capture when the vault cannot be read", async () => {
    const { ok, vault } = setup();
    ok.rest.git.getRef = async () => { throw new Error("github down"); };
    expect(await vaultContext(vault, "tariffe")).toEqual({ titles: [], tags: [] });
  });
});

describe("resolveRelated", () => {
  it("keeps only titles that exist, as filename stems", async () => {
    const { vault } = setup();
    // "Soglia di pareggio" is the H1; the file is "Soglia make-buy.md" — the link must use the stem
    expect(await resolveRelated(vault, ["Soglia di pareggio", "Un FTE", "Nota inventata dal modello"]))
      .toEqual(["Soglia make-buy", "Un FTE"]);
  });
  it("matches case-insensitively and drops duplicates", async () => {
    const { vault } = setup();
    expect(await resolveRelated(vault, ["un fte", "Un FTE", "  UN FTE  "])).toEqual(["Un FTE"]);
  });
  it("never links a note to itself", async () => {
    const { vault } = setup();
    expect(await resolveRelated(vault, ["Un FTE"], "un fte")).toEqual([]);
  });
  it("returns nothing for an empty list or an unreadable vault", async () => {
    const { ok, vault } = setup();
    expect(await resolveRelated(vault, [])).toEqual([]);
    ok.rest.git.getRef = async () => { throw new Error("github down"); };
    expect(await resolveRelated(vault, ["Un FTE"])).toEqual([]);
  });
});
