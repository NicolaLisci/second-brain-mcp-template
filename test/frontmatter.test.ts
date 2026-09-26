import { describe, expect, it } from "vitest";
import { parseNote, serializeNote, extractWikilinks, titleOf, bumpUpdated } from "../src/frontmatter";

const NOTE = `---
type: concept
created: 2026-08-01
tags: [capacitys, costi]
status: active
---

# Annual capacity

## Summary
Testo con [[Tariffe orarie]] e [[Make or buy|make/buy]].
`;

describe("frontmatter", () => {
  it("parses scalar and inline-array values", () => {
    const { frontmatter, body } = parseNote(NOTE);
    expect(frontmatter.type).toBe("concept");
    expect(frontmatter.tags).toEqual(["capacitys", "costi"]);
    expect(frontmatter.created).toBe("2026-08-01");
    expect(body.startsWith("\n# Annual capacity")).toBe(true);
  });
  it("returns empty frontmatter when absent", () => {
    expect(parseNote("# solo titolo\n")).toEqual({ frontmatter: {}, body: "# solo titolo\n" });
  });
  it("round-trips", () => {
    const { frontmatter, body } = parseNote(NOTE);
    expect(parseNote(serializeNote(frontmatter, body))).toEqual({ frontmatter, body });
  });
  it("serializes empty values as bare keys", () => {
    expect(serializeNote({ created: "", tags: [] }, "x")).toBe("---\ncreated:\ntags: []\n---\nx");
  });
  it("extracts wikilinks without aliases, deduped", () => {
    expect(extractWikilinks("[[A]] [[B|b]] [[A]]")).toEqual(["A", "B"]);
  });
  it("gets the title from the H1, falling back to filename", () => {
    expect(titleOf(NOTE, "30 Resources/x.md")).toBe("Annual capacity");
    expect(titleOf("no heading", "30 Resources/Foo Bar.md")).toBe("Foo Bar");
  });
  it("handles CRLF line endings", () => {
    const { frontmatter, body } = parseNote("---\r\ntype: x\r\n---\r\nbody\r\n");
    expect(frontmatter).toEqual({ type: "x" });
    expect(body).toBe("body\r\n");
  });
  it("does not treat --- inside body as a delimiter", () => {
    const { body } = parseNote("---\na: 1\n---\n\ntext\n\n---\n\nmore\n");
    expect(body).toBe("\ntext\n\n---\n\nmore\n");
  });
  it("preserves colons in values", () => {
    const { frontmatter } = parseNote("---\nurl: http://x.com: extra\n---\n");
    expect(frontmatter.url).toBe("http://x.com: extra");
  });
  it("extracts link target from combined alias and heading", () => {
    expect(extractWikilinks("[[Foo#Sec|Alias]]")).toEqual(["Foo"]);
  });
  it("excludes embeds from wikilinks", () => {
    expect(extractWikilinks("See ![[img.png]] and [[Real]]")).toEqual(["Real"]);
  });
  it("returns empty frontmatter for unclosed frontmatter", () => {
    const { frontmatter, body } = parseNote("---\ntype: x\nno close");
    expect(frontmatter).toEqual({});
    expect(body).toBe("---\ntype: x\nno close");
  });
});

describe("bumpUpdated", () => {
  const BLOCK = `---
type: concept
tags:
  - "quoted tag"
  - costi
# a comment line
updated: 2026-08-01
status: active
---

# Annual capacity

body
`;
  it("replaces updated in place, preserving block-style tags, quotes and comments", () => {
    const out = bumpUpdated(BLOCK, "2026-08-29");
    expect(out).toBe(BLOCK.replace("updated: 2026-08-01", "updated: 2026-08-29"));
    expect(out).toContain('  - "quoted tag"');
    expect(out).toContain("# a comment line");
  });
  it("inserts updated before the closing --- when absent", () => {
    const src = "---\ntype: concept\ntags:\n  - a\n---\n\nbody\n";
    expect(bumpUpdated(src, "2026-08-29")).toBe("---\ntype: concept\ntags:\n  - a\nupdated: 2026-08-29\n---\n\nbody\n");
  });
  it("prepends a frontmatter block when the note has none", () => {
    expect(bumpUpdated("# solo titolo\n", "2026-08-29")).toBe("---\nupdated: 2026-08-29\n---\n# solo titolo\n");
  });
  it("does not touch an updated: line that lives in the body", () => {
    const src = "---\ntype: concept\n---\n\nupdated: 1999-01-01\n";
    expect(bumpUpdated(src, "2026-08-29")).toBe("---\ntype: concept\nupdated: 2026-08-29\n---\n\nupdated: 1999-01-01\n");
  });
  it("is idempotent: bumping twice with the same date changes nothing", () => {
    const once = bumpUpdated(BLOCK, "2026-08-29");
    expect(bumpUpdated(once, "2026-08-29")).toBe(once);
    const noFm = bumpUpdated("# solo titolo\n", "2026-08-29");
    expect(bumpUpdated(noFm, "2026-08-29")).toBe(noFm);
  });
  it("leaves a note that already carries the same date byte-identical", () => {
    const src = "---\ntype: concept\nupdated: 2026-08-29\n---\n\nbody\n";
    expect(bumpUpdated(src, "2026-08-29")).toBe(src);
  });
  it("never inserts a second updated: line", () => {
    let md = "---\ntype: concept\nupdated: 2026-08-29\n---\n\nbody\n";
    for (let i = 0; i < 3; i++) md = bumpUpdated(md, "2026-08-29");
    expect(md.match(/^updated:/gm)!).toHaveLength(1);
  });
  it("handles CRLF frontmatter", () => {
    expect(bumpUpdated("---\r\nupdated: 2020-01-01\r\n---\r\nbody\r\n", "2026-08-29"))
      .toBe("---\r\nupdated: 2026-08-29\r\n---\r\nbody\r\n");
  });
});
