import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import { renderNote, renderUpdateSection, formatSource, isoDate } from "../src/render";
import { parseNote } from "../src/frontmatter";

const tpl = (n: string) => readFileSync(new URL(`./fixtures/templates/${n}.md`, import.meta.url), "utf8");
const meta = { capturedBy: "claude-code", trigger: "auto" as const, now: new Date("2026-08-29T13:02:00Z") };
const fields = {
  summary: "Annual capacity is 1760 hours.",
  why_it_matters: "Serve per le stime make/buy.",
  related: ["Tariffe orarie interne"],
  sources: [{ kind: "conversation" as const, ref: "Chat con Example Person", date: "2026-08-20" }],
  tags: ["costi"],
};

describe("isoDate", () => {
  it("formats in UTC by default and supports an explicit timezone", () => {
    const d = new Date("2026-08-29T23:30:00Z");
    expect(isoDate(d)).toBe("2026-08-29");
    expect(isoDate(d, "Europe/Rome")).toBe("2026-08-30");
  });
});

describe("renderNote", () => {
  it("renders a concept with filled sections and frontmatter", () => {
    const md = renderNote("concept", tpl("Concept"), "Annual capacity", fields, meta);
    const { frontmatter, body } = parseNote(md);
    expect(frontmatter).toMatchObject({ type: "concept", created: "2026-08-29", updated: "2026-08-29", status: "active", tags: ["costi"], captured_by: "claude-code", trigger: "auto" });
    expect(body).toContain("# Annual capacity");
    expect(body).toMatch(/## Summary\n\nAnnual capacity is 1760 hours\./);
    expect(body).toMatch(/## Why it matters\n\nServe per le stime make\/buy\./);
    expect(body).toMatch(/## Related\n\n- \[\[Tariffe orarie interne\]\]/);
    expect(body).toMatch(/## Sources\n\n- conversation: Chat con Example Person \(2026-08-20\)/);
    expect(body).not.toContain("Short explanation of the concept.");
    expect(body).not.toContain("- [[]]");
  });
  it("renders project actions as checkboxes and decisions as bullets", () => {
    const md = renderNote("project", tpl("Project"), "Make or buy", { ...fields, action: "Chiedere conferma a ICT", decision: "Il make ricade su EA" }, meta);
    expect(md).toMatch(/## Next actions\n\n- \[ \] Chiedere conferma a ICT/);
    expect(md).toMatch(/## Decisions\n\n- Il make ricade su EA/);
    expect(md).not.toContain("## Distillation");
  });
  it("adds a Distillation block for unmapped distillation fields", () => {
    const md = renderNote("concept", tpl("Concept"), "X", { ...fields, fact: "F", interpretation: "I" }, meta);
    expect(md).toMatch(/## Distillation\n\n### Fact\n\nF\n\n### Interpretation\n\nI/);
    expect(md.endsWith("I\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });
  it("renders a source with url in frontmatter and keeps status unread", () => {
    const md = renderNote("source", tpl("Source"), "Doc ISO", { ...fields, sources: [{ kind: "url", ref: "https://example.com/iso" }] }, meta);
    const { frontmatter, body } = parseNote(md);
    expect(frontmatter).toMatchObject({ source_type: "url", source_url: "https://example.com/iso", status: "unread" });
    expect(body).toMatch(/## Source\n\n- url: https:\/\/example\.com\/iso/);
    expect(body).toMatch(/## Key points\n\nAnnual capacity/);
  });
  it("appends a mapped section the template does not carry, instead of failing the capture", () => {
    const out = renderNote("concept", "---\ntype: concept\n---\n# {{title}}\n", "X", fields, meta);
    expect(out).toContain("## Summary\n\nAnnual capacity is 1760 hours.");
    expect(out).toContain("## Sources\n\n- conversation: Chat con Example Person (2026-08-20)");
  });
  it("empties an unfilled section rather than leaving the template placeholder", () => {
    const out = renderNote("concept", tpl("Concept"), "X", { ...fields, related: [], why_it_matters: undefined }, meta);
    expect(out).not.toContain("- [[]]");                                     // never write a broken wikilink
    expect(out).not.toContain("Why this knowledge is useful or relevant.");  // nor the placeholder prose
    expect(out).toContain("## Why it matters\n\n## Related\n\n## Sources");
    expect(out).toContain("## Summary\n\nAnnual capacity is 1760 hours.");
  });
  it("keeps the sources on project and area notes, whose templates have no section for them", () => {
    for (const [type, name] of [["project", "Project"], ["area", "Area"]] as const) {
      const md = renderNote(type, tpl(name), "X", fields, meta);
      expect(md).toContain("## Sources\n\n- conversation: Chat con Example Person (2026-08-20)");
    }
  });
  it("empties sections outside the mapping too, placeholders and all", () => {
    // Area's "## Relevant knowledge" is not in MAPPINGS.area, and its placeholder is "- [[]]" —
    // a broken wikilink that used to reach the vault in every area note.
    const md = renderNote("area", tpl("Area"), "Finanze personali", fields, meta);
    expect(md).not.toContain("- [[]]");
    expect(md).not.toContain("What does");           // the Standards placeholder
    expect(md).toContain("## Relevant knowledge\n");
    expect(md).toContain("## Responsibility\n\nAnnual capacity is 1760 hours.");
  });
  it("distils into the section the Source template already has, not a second one", () => {
    const md = renderNote("source", tpl("Source"), "Articolo", { ...fields, fact: "F.", idea: "I." }, meta);
    expect(md).toContain("## Distilled knowledge\n\n### Fact\n\nF.\n\n### Idea\n\nI.");
    expect(md).not.toContain("## Distillation");
    expect(md).not.toContain("Concepts or notes derived from this source.");
  });
  it("still adds its own Distillation section to a template that has none", () => {
    const md = renderNote("concept", tpl("Concept"), "X", { ...fields, fact: "F." }, meta);
    expect(md).toContain("## Distillation\n\n### Fact\n\nF.");
  });
  it("renders an update section", () => {
    expect(renderUpdateSection({ summary: "Nuovo dato", sources: [{ kind: "jira", ref: "TICKET-123" }] }, meta))
      .toBe("\n## Update 2026-08-29\n\nNuovo dato\n\n**Sources**\n\n- jira: TICKET-123\n");
  });
  it("formats sources", () => {
    expect(formatSource({ kind: "path", ref: "/x/y.pdf" })).toBe("- path: /x/y.pdf");
  });
  it("renders a source note with all sources under ## Source and frontmatter source_url as the first ref", () => {
    const md = renderNote(
      "source",
      tpl("Source"),
      "Doc ISO",
      { ...fields, sources: [{ kind: "url", ref: "https://example.com/a" }, { kind: "path", ref: "/x/b.pdf" }] },
      meta,
    );
    const { frontmatter, body } = parseNote(md);
    expect(frontmatter).toMatchObject({ source_type: "url", source_url: "https://example.com/a" });
    expect(body).toMatch(/## Source\n\n- url: https:\/\/example\.com\/a\n- path: \/x\/b\.pdf/);
  });
  it("preserves internal blank lines in a section's content byte-for-byte", () => {
    const md = renderNote("concept", tpl("Concept"), "X", { ...fields, summary: "Par 1\n\n\n\nPar 2" }, meta);
    expect(md).toContain("## Summary\n\nPar 1\n\n\n\nPar 2\n\n## Why it matters");
  });
  it("renders a concept note byte-for-byte (golden)", () => {
    const md = renderNote("concept", tpl("Concept"), "Annual capacity", fields, meta);
    expect(md).toBe(
      "---\n" +
      "type: concept\n" +
      "created: 2026-08-29\n" +
      "updated: 2026-08-29\n" +
      "status: active\n" +
      "tags: [costi]\n" +
      "captured_by: claude-code\n" +
      "trigger: auto\n" +
      "---\n" +
      "\n" +
      "# Annual capacity\n" +
      "\n" +
      "## Summary\n" +
      "\n" +
      "Annual capacity is 1760 hours.\n" +
      "\n" +
      "## Why it matters\n" +
      "\n" +
      "Serve per le stime make/buy.\n" +
      "\n" +
      "## Related\n" +
      "\n" +
      "- [[Tariffe orarie interne]]\n" +
      "\n" +
      "## Sources\n" +
      "\n" +
      "- conversation: Chat con Example Person (2026-08-20)\n"
    );
    expect(md.endsWith("\n")).toBe(true);
  });
});
