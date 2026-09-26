import { describe, expect, it } from "vitest";
import type { CaptureResult } from "../src/capture";
import type { AiDecision } from "../src/ai-router";
import { fallbackNote, formatReply, isDurableMessage, parseIntent, planMessage } from "../src/telegram";

describe("Telegram smart router", () => {
  it("routes explicit save commands", () => {
    expect(parseIntent("/save Ricordami questa decisione")).toEqual({
      kind: "save", text: "Ricordami questa decisione", vault: "personal", forced: true,
    });
    expect(parseIntent("/work PROJECT usa questa configurazione")).toEqual({
      kind: "save", text: "PROJECT usa questa configurazione", vault: "work", forced: true,
    });
    expect(parseIntent("/savework Regola interna")).toEqual({
      kind: "save", text: "Regola interna", vault: "work", forced: true,
    });
  });

  it("routes ask commands", () => {
    expect(parseIntent("/ask Telegram webhook")).toEqual({ kind: "ask", query: "Telegram webhook", vault: "both" });
    expect(parseIntent("/askwork PROJECT architecture")).toEqual({ kind: "ask", query: "PROJECT architecture", vault: "work" });
    expect(parseIntent("/askpersonal portafoglio")).toEqual({ kind: "ask", query: "portafoglio", vault: "personal" });
  });

  it("keeps ordinary messages in auto mode", () => {
    expect(parseIntent("Ho deciso di usare Telegram per il second brain")).toEqual({
      kind: "auto", text: "Ho deciso di usare Telegram per il second brain",
    });
  });

  it("rejects obvious transient messages", () => {
    expect(isDurableMessage("ok")).toBe(false);
    expect(isDurableMessage("grazie!" )).toBe(false);
    expect(isDurableMessage("test")).toBe(false);
  });

  it("recognizes durable knowledge and links", () => {
    expect(isDurableMessage("Ho deciso di usare Cloudflare Workers per il progetto")).toBe(true);
    expect(isDurableMessage("https://example.com/article")).toBe(true);
  });
});

describe("formatReply", () => {
  const created = { status: "created", vault: "personal", path: "30 Resources/nota.md", commit: "c1" } as const;

  it("passes a template fallback on to the user instead of hiding it", () => {
    const fellBack: CaptureResult = { ...created, warning: "Project.md not found in 90 System/Templates: saved as a source note instead" };
    const out = formatReply(fellBack, "personal", null, []);
    expect(out).toContain("✅ Salvato in personal");
    expect(out).toContain("⚠️ Project.md not found");
  });
  it("names the near-duplicates a forced save wrote past", () => {
    const out = formatReply(created, "personal", null, ["Home.md", "00 Inbox/ciao.md"]);
    expect(out).toContain("✅ Salvato in personal: 30 Resources/nota.md");
    expect(out).toContain("Note simili");
    expect(out).toContain("• 00 Inbox/ciao.md");
  });
  it("tells the user how to force a save the duplicate check blocked", () => {
    const blocked: CaptureResult = { status: "candidates", candidates: [{ vault: "personal", path: "00 Inbox/ciao.md", title: "ciao", type: "source", excerpt: "", passage: "", score: 4, coverage: 1 }], dedup_token: "t", hint: "" };
    expect(formatReply(blocked, "personal", "high: x", [])).toContain("/save");
  });
  it("reports the routing reason only for automatic captures", () => {
    expect(formatReply(created, "personal", "90%: termini personali", [])).toContain("🧭 Vault: personal — 90%: termini personali");
    expect(formatReply(created, "personal", null, []).endsWith("🧭 Vault: personal")).toBe(true);
  });
});

describe("planMessage", () => {
  const auto = { kind: "auto", text: "ho deciso di usare Workers" } as const;
  const note = { type: "concept" as const, title: "Cloudflare Workers", summary: "Runtime scelto.", tags: ["cloudflare"], related: [] };
  const decision = (o: Partial<AiDecision> = {}): AiDecision =>
    ({ intent: "save", vault: "personal", confidence: 0.9, reason: "termini personali", note, ...o });

  it("saves what the model classified, in the vault it chose", () => {
    expect(planMessage(auto, decision(), auto.text)).toMatchObject({ action: "save", vault: "personal", trigger: "auto", note });
  });
  it("asks the vault when the model is unsure, or says so itself", () => {
    expect(planMessage(auto, decision({ vault: null }), auto.text)).toMatchObject({ action: "clarify", note });
    expect(planMessage(auto, decision({ confidence: 0.3 }), auto.text)).toMatchObject({ action: "clarify" });
    expect(planMessage(auto, decision({ intent: "clarification", vault: null }), auto.text)).toMatchObject({ action: "clarify" });
  });
  it("routes a question to search, over both vaults when no vault was picked", () => {
    expect(planMessage(auto, decision({ intent: "ask", query: "tariffe", vault: null }), auto.text)).toEqual({ action: "ask", query: "tariffe", vault: "both" });
    expect(planMessage(auto, decision({ intent: "ask", query: "tariffe", vault: "work" }), auto.text)).toMatchObject({ vault: "work" });
    // no query from the model: search what was written
    expect(planMessage(auto, decision({ intent: "ask", query: undefined }), auto.text)).toMatchObject({ query: auto.text });
  });
  it("drops what the model judged transient", () => {
    expect(planMessage(auto, decision({ intent: "ignore", vault: null, reason: "saluto" }), auto.text)).toEqual({ action: "ignore", reason: "saluto" });
  });

  it("lets an explicit command override intent and vault, but keep the model's structure", () => {
    const save = { kind: "save", text: auto.text, vault: "work", forced: true } as const;
    expect(planMessage(save, decision({ intent: "ignore", vault: null }), auto.text))
      .toMatchObject({ action: "save", vault: "work", trigger: "explicit", note });
  });
  it("falls back to the raw message when the model produced no note", () => {
    const save = { kind: "save", text: auto.text, vault: "personal", forced: true } as const;
    expect(planMessage(save, decision({ note: undefined }), auto.text)).toMatchObject({ note: fallbackNote(auto.text) });
  });
  it("keeps /ask explicit, whatever the model thought", () => {
    const ask = { kind: "ask", query: "tariffe orarie", vault: "work" } as const;
    expect(planMessage(ask, decision({ intent: "save" }), "tariffe orarie")).toEqual({ action: "ask", query: "tariffe orarie", vault: "work" });
  });
});
