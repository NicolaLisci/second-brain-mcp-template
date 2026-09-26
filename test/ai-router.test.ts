import { describe, expect, it, vi } from "vitest";
import { AI_MODEL, classifyMessage, extractJson, normalize, type AiLike } from "../src/ai-router";

const full = (o: Record<string, unknown> = {}) => ({
  intent: "save", vault: "personal", confidence: 0.9, reason: "termini personali", query: "",
  note: { type: "concept", title: "Bot Telegram per il second brain", summary: "Ho creato un bot Telegram che cattura note.", why_it_matters: "", fact: "", idea: "", decision: "", action: "", tags: ["telegram", "automazione", "second-brain"], related: ["Annual capacity"] },
  ...o,
});

describe("extractJson", () => {
  it("takes the object Workers AI returns under response", () => {
    expect(extractJson({ response: { intent: "ignore" } })).toEqual({ intent: "ignore" });
  });
  it("parses a JSON string response", () => {
    expect(extractJson({ response: '{"intent":"ignore"}' })).toEqual({ intent: "ignore" });
  });
  it("parses a fenced JSON string with prose around it", () => {
    expect(extractJson('Ecco:\n```json\n{"intent":"ask","query":"tariffe"}\n```')).toEqual({ intent: "ask", query: "tariffe" });
  });
  it("returns null when there is no JSON at all", () => {
    expect(extractJson({ response: "non lo so" })).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });
});

describe("normalize", () => {
  it("builds a decision and a note from a well-formed answer", () => {
    const d = normalize(full())!;
    expect(d).toMatchObject({ intent: "save", vault: "personal", confidence: 0.9 });
    expect(d.note).toMatchObject({ type: "concept", title: "Bot Telegram per il second brain", summary: "Ho creato un bot Telegram che cattura note." });
    expect(d.note!.why_it_matters).toBeUndefined(); // empty sentinels do not become empty sections
  });
  it("drops channel tags the model was told not to emit, dedupes and caps at five", () => {
    const d = normalize(full({ note: { ...full().note, tags: ["Telegram", "nota", "#Costi", "costi", "second brain", "a", "x1", "x2", "x3", "x4", "x5"] } }))!;
    expect(d.note!.tags).toEqual(["costi", "second-brain", "x1", "x2", "x3"]);
  });
  it("forces type source for save_source, whatever the model picked", () => {
    expect(normalize(full({ intent: "save_source" }))!.note!.type).toBe("source");
  });
  it("turns the unknown vault sentinel into null", () => {
    expect(normalize(full({ intent: "clarification", vault: "unknown" }))!.vault).toBeNull();
  });
  it("clamps the confidence into 0..1", () => {
    expect(normalize(full({ confidence: 7 }))!.confidence).toBe(1);
    expect(normalize(full({ confidence: -2 }))!.confidence).toBe(0);
  });
  it("never lets a punctuation-only title collapse to nothing", () => {
    expect(normalize(full({ note: { ...full().note, title: "..." } }))!.note!.title).toBe("Ho creato un bot Telegram che cattura note");
  });
  it("strips characters that would break the frontmatter tag list", () => {
    const d = normalize(full({ note: { ...full().note, tags: ["costi, ricavi", "make/buy"] } }))!;
    expect(d.note!.tags).toEqual(["costi-ricavi", "make-buy"]);
  });
  it("trims an overlong title and its trailing punctuation", () => {
    const d = normalize(full({ note: { ...full().note, title: `${"a".repeat(80)}...` } }))!;
    expect(d.note!.title).toHaveLength(70);
    expect(d.note!.title.endsWith(".")).toBe(false);
  });
  it("falls back to the summary when the model left the title empty", () => {
    expect(normalize(full({ note: { ...full().note, title: "  " } }))!.note!.title).toBe("Ho creato un bot Telegram che cattura note");
  });
  it("keeps the related titles, deduped and capped", () => {
    expect(normalize(full())!.note!.related).toEqual(["Annual capacity"]);
    const many = normalize(full({ note: { ...full().note, related: [" A ", "A", "B", "C", "D", "E", "F"] } }))!;
    expect(many.note!.related).toEqual(["A", "B", "C", "D", "E"]);
  });
  it("refuses a save with nothing to write, so the caller falls back", () => {
    expect(normalize(full({ note: { ...full().note, summary: "" } }))).toBeNull();
  });
  it("keeps ask and ignore without a note", () => {
    expect(normalize(full({ intent: "ask", query: "tariffe orarie" }))).toMatchObject({ intent: "ask", query: "tariffe orarie", note: undefined });
    expect(normalize(full({ intent: "ignore", vault: "unknown" }))!.note).toBeUndefined();
  });
  it("returns null on an unusable answer", () => {
    expect(normalize({ intent: "boh" })).toBeNull();
    expect(normalize("nope")).toBeNull();
    expect(normalize(null)).toBeNull();
  });
});

describe("classifyMessage", () => {
  it("returns null without a binding, so the caller uses the heuristics", async () => {
    expect(await classifyMessage(undefined, { text: "ciao", forwarded: false, urls: [] })).toBeNull();
  });
  it("asks the configured model for schema-constrained JSON and includes the message", async () => {
    const run = vi.fn().mockResolvedValue({ response: full() });
    const d = await classifyMessage({ run } as AiLike, { text: "ho creato un bot telegram", forwarded: true, urls: ["https://x.test"], linkContent: "estratto" });
    expect(d).toMatchObject({ intent: "save", vault: "personal" });
    const [model, inputs] = run.mock.calls[0] as [string, any];
    expect(model).toBe(AI_MODEL);
    expect(inputs.response_format.type).toBe("json_schema");
    expect(inputs.messages[1].content).toContain("ho creato un bot telegram");
    expect(inputs.messages[1].content).toContain("forwarded");
    expect(inputs.messages[1].content).toContain("estratto");
  });
  it("shows the model what the vaults already contain", async () => {
    const run = vi.fn().mockResolvedValue({ response: full() });
    await classifyMessage({ run } as AiLike, {
      text: "tariffe", forwarded: false, urls: [],
      vaults: { work: { titles: ["Tariffe orarie interne"], tags: ["costi", "capacity"] }, personal: { titles: [], tags: [] } },
    });
    const prompt = (run.mock.calls[0] as [string, any])[1].messages[1].content as string;
    expect(prompt).toContain('VAULT "work"');
    expect(prompt).toContain('"Tariffe orarie interne"');
    expect(prompt).toContain("costi, capacity");
    expect(prompt).not.toContain('VAULT "personal"'); // an empty vault block is noise, not context
  });
  it("returns null when the model throws or answers with nonsense", async () => {
    expect(await classifyMessage({ run: async () => { throw new Error("503"); } }, { text: "x", forwarded: false, urls: [] })).toBeNull();
    expect(await classifyMessage({ run: async () => ({ response: "boh" }) }, { text: "x", forwarded: false, urls: [] })).toBeNull();
  });
});
