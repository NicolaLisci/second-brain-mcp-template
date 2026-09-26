import { z } from "zod";
import type { NoteType, VaultId } from "./config";
import { CUT_RULE, NEVER_RULES, NOTE_TYPES, vaultScopeLine } from "./conventions";
import type { VaultContext } from "./vault-context";
import { PERSONAL_TERMS, WORK_TERMS } from "./vault-router";

/** Structured output quality matters more here than latency: one call per message, at human pace. */
export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const AI_TIMEOUT_MS = 20_000;

export type AiIntent = "save" | "save_source" | "ask" | "ignore" | "clarification";

export interface AiNote {
  type: NoteType;
  title: string;
  summary: string;
  why_it_matters?: string;
  fact?: string;
  idea?: string;
  decision?: string;
  action?: string;
  tags: string[];
  /** Titles of existing notes to link to. Resolved against the vault before they are written. */
  related: string[];
}

export interface AiDecision {
  intent: AiIntent;
  vault: VaultId | null;
  confidence: number;
  reason: string;
  query?: string;
  note?: AiNote;
}

/** The shape of the Workers AI binding we depend on — tests pass a fake. */
export interface AiLike {
  run(model: string, inputs: unknown, options?: unknown): Promise<unknown>;
}

export interface ClassifyInput {
  text: string;
  forwarded: boolean;
  urls: string[];
  /** readable text pulled from the links, when there was any */
  linkContent?: string;
  /** what each vault already holds, so the model classifies against the real vault */
  vaults?: Partial<Record<VaultId, VaultContext>>;
}

/**
 * Sentinels instead of nulls and optionals: guided decoding is far more reliable when every
 * field is required and every value is a plain string. `normalize` turns them back into a
 * proper AiDecision.
 */
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "vault", "confidence", "reason", "query", "note"],
  properties: {
    intent: { type: "string", enum: ["save", "save_source", "ask", "ignore", "clarification"] },
    vault: { type: "string", enum: ["personal", "work", "unknown"] },
    confidence: { type: "number" },
    reason: { type: "string" },
    query: { type: "string" },
    note: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title", "summary", "why_it_matters", "fact", "idea", "decision", "action", "tags", "related"],
      properties: {
        type: { type: "string", enum: ["concept", "project", "area", "source"] },
        title: { type: "string" },
        summary: { type: "string" },
        why_it_matters: { type: "string" },
        fact: { type: "string" },
        idea: { type: "string" },
        decision: { type: "string" },
        action: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        related: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

const RawSchema = z.object({
  intent: z.enum(["save", "save_source", "ask", "ignore", "clarification"]),
  vault: z.enum(["personal", "work", "unknown"]).catch("unknown"),
  confidence: z.coerce.number().catch(0.5),
  reason: z.string().catch(""),
  query: z.string().catch(""),
  note: z.object({
    type: z.enum(["concept", "project", "area", "source"]).catch("source"),
    title: z.string().catch(""),
    summary: z.string().catch(""),
    why_it_matters: z.string().catch(""),
    fact: z.string().catch(""),
    idea: z.string().catch(""),
    decision: z.string().catch(""),
    action: z.string().catch(""),
    tags: z.array(z.string()).catch([]),
    related: z.array(z.string()).catch([]),
  }).partial().catch({}),
});

const SYSTEM_PROMPT = `You are the router of "Memoria", a second-brain capture bot on Telegram.
Its owner writes to it in plain language, mostly Italian, sometimes English. You decide what to do
with each message. You never talk to the user: you only return JSON.

TWO VAULTS, both organised PARA-style:
- ${vaultScopeLine("work")} Typical terms: ${WORK_TERMS.join(", ")}.
- ${vaultScopeLine("personal")} Typical terms: ${PERSONAL_TERMS.join(", ")}.

INTENTS:
- "save": the message carries durable knowledge. The test: ${CUT_RULE}
- "save_source": the message is (or points to) external material — a link, a forwarded message, a
  quote, a document reference — worth keeping as a source note.
- "ask": the owner is asking something OF the vault ("cosa avevo deciso su…", "come ho configurato…",
  "che tariffe usiamo?"). Put the search keywords in "query".
- "ignore": small talk, acknowledgements, tests, greetings, transient chatter — anything the cut
  rule above rejects.
- "clarification": it IS worth saving but you genuinely cannot tell which vault it belongs to.

RULES:
- A forwarded message or a message containing a link is almost always "save_source", not "ignore".
- Use "clarification" only for the vault question, and only when confidence would be below 0.6.
  Never use it because the content itself is unclear — that is "ignore" or "save".
- "vault": "unknown" only when intent is "clarification" or "ignore".
- "confidence": 0..1, how sure you are of intent AND vault together.
- "reason": at most 12 words, in Italian, explaining the routing. It is shown to the owner.
- ${NEVER_RULES.join("\n- ")}

THE NOTE (fill it for "save" and "save_source", leave the fields empty otherwise):
- "type": ${NOTE_TYPES}
- "title": a short noun phrase naming the subject, NOT the raw message. Max 70 chars, no trailing
  punctuation, no date, no "Nota su…".
- "summary": 1-3 sentences restating the knowledge in the message. Same language as the message.
- "why_it_matters": why the owner will want this later. Empty string if the message does not say
  or imply it.
- "fact" / "idea" / "decision" / "action": fill only the ones the message actually contains.
  "action" must be a concrete next step. Empty string otherwise.
- "tags": 2-5 lowercase topical tags, single words or hyphenated. REUSE the tags already in the
  vault (listed below) whenever one fits — inventing a synonym of an existing tag fragments the
  vault. Never tag the channel or the capture itself (no "telegram", "nota", "appunto", "auto").
- "related": titles of existing notes this one belongs with, COPIED EXACTLY from the list below.
  Never write a title that is not in that list, and never invent one. Empty array if none fits.

The notes and tags listed below are the real content of the two vaults. Use them for "related"
and "tags", and as evidence for the vault: if the nearby notes are all in one vault, that is
where this message belongs too.`;

function vaultBlock(input: ClassifyInput): string {
  const parts: string[] = [];
  for (const id of ["personal", "work"] as const) {
    const ctx = input.vaults?.[id];
    if (!ctx || (!ctx.titles.length && !ctx.tags.length)) continue;
    const lines = [`VAULT "${id}":`];
    if (ctx.titles.length) lines.push(`  nearby notes: ${ctx.titles.map((t) => `"${t}"`).join(", ")}`);
    if (ctx.tags.length) lines.push(`  tags in use: ${ctx.tags.join(", ")}`);
    parts.push(lines.join("\n"));
  }
  return parts.join("\n");
}

function userPrompt(input: ClassifyInput): string {
  const parts = [`MESSAGE:\n${input.text}`];
  if (input.forwarded) parts.push("CONTEXT: this message was forwarded from another chat.");
  if (input.urls.length) parts.push(`CONTEXT: it contains links: ${input.urls.join(", ")}`);
  if (input.linkContent) parts.push(`CONTENT EXTRACTED FROM THE LINKS:\n${input.linkContent}`);
  const vaults = vaultBlock(input);
  if (vaults) parts.push(`WHAT THE VAULTS ALREADY CONTAIN:\n${vaults}`);
  return parts.join("\n\n");
}

/** Workers AI answers with an object, a JSON string, or a fenced JSON string depending on the model. */
export function extractJson(raw: unknown): unknown {
  const payload = raw && typeof raw === "object" && "response" in (raw as Record<string, unknown>)
    ? (raw as Record<string, unknown>).response
    : raw;
  if (payload && typeof payload === "object") return payload;
  if (typeof payload !== "string") return null;
  const unfenced = payload.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(unfenced.slice(start, end + 1)); } catch { return null; }
}

const NON_TOPICAL_TAGS = new Set(["telegram", "nota", "note", "appunto", "appunti", "auto", "save", "salvataggio", "memoria", "bot", "messaggio"]);

/** Turn the model's sentinel-filled answer into the decision the bot acts on, or null if unusable. */
export function normalize(parsed: unknown): AiDecision | null {
  const r = RawSchema.safeParse(parsed);
  if (!r.success) return null;
  const d = r.data;
  const str = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t && t.toLowerCase() !== "n/a" && t !== "-" ? t : undefined;
  };

  const saving = d.intent === "save" || d.intent === "save_source";
  const summary = str(d.note?.summary);
  // A save with nothing to write is not a save: let the caller fall back rather than commit an empty note.
  if (saving && !summary) return null;

  const title = (t: string) => t.slice(0, 70).replace(/[.,;:\s]+$/, "").trim();
  const note: AiNote | undefined = saving
    ? {
        type: d.intent === "save_source" ? "source" : (d.note?.type ?? "source"),
        title: title(str(d.note?.title) ?? "") || title(summary!) || "Nota",
        summary: summary!,
        why_it_matters: str(d.note?.why_it_matters),
        fact: str(d.note?.fact),
        idea: str(d.note?.idea),
        decision: str(d.note?.decision),
        action: str(d.note?.action),
        tags: [...new Set((d.note?.tags ?? [])
          .map((t) => t.trim().toLowerCase().replace(/^#/, "")
            .replace(/[\s/_,;|]+/g, "-").replace(/[^\p{Letter}\p{Number}-]/gu, "").replace(/-{2,}/g, "-").replace(/^-|-$/g, ""))
          .filter((t) => t.length >= 2 && !NON_TOPICAL_TAGS.has(t)))].slice(0, 5),
        related: [...new Set((d.note?.related ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 5),
      }
    : undefined;

  return {
    intent: d.intent,
    vault: d.vault === "unknown" ? null : d.vault,
    confidence: Math.min(1, Math.max(0, Number.isFinite(d.confidence) ? d.confidence : 0.5)),
    reason: str(d.reason) ?? "nessuna motivazione",
    query: str(d.query),
    note,
  };
}

/** What a search hit contributes to an answer: enough to quote from, with its address. */
export interface AnswerSource { vault: string; path: string; title: string; passage: string }

const ANSWER_PROMPT = `You answer the owner's question about his own second brain, from the notes
below and NOTHING else. Rules:
- Answer in the language of the question, normally Italian. Two or three sentences at most.
- Quote figures, names and dates EXACTLY as they appear. Never round, never recompute.
- If several notes disagree, say so instead of picking one.
- If the notes do not contain the answer, say exactly that in one line. Never fill the gap with
  general knowledge, and never guess.
- Do not list the sources: they are shown separately. Do not use headings or bullet points.`;

/**
 * Turn the search hits into an actual answer. Returns null on any failure, so the caller falls
 * back to showing the hits — a list of paths is a worse answer, not a broken one.
 */
export async function answerQuestion(ai: AiLike | undefined, question: string, sources: AnswerSource[]): Promise<string | null> {
  if (!ai || !question.trim() || !sources.length) return null;
  const notes = sources
    .map((s, i) => `[${i + 1}] "${s.title}" (${s.vault}, ${s.path})\n${s.passage}`)
    .join("\n\n");
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const call = ai.run(AI_MODEL, {
      messages: [
        { role: "system", content: ANSWER_PROMPT },
        { role: "user", content: `QUESTION:\n${question}\n\nNOTES:\n${notes}` },
      ],
      max_tokens: 400,
      temperature: 0.1,
    });
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("AI timeout")), AI_TIMEOUT_MS); });
    try {
      const raw = await Promise.race([call, timeout]);
      const text = typeof raw === "string" ? raw : (raw as { response?: unknown } | null)?.response;
      if (typeof text !== "string") return null;
      const answer = text.trim();
      return answer ? answer.slice(0, 1200) : null;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn("Workers AI answer failed", error);
    return null;
  }
}

/**
 * Ask Workers AI what to do with a message. Returns null on any failure — no binding, timeout,
 * malformed answer — so the caller can fall back to the deterministic heuristics.
 */
export async function classifyMessage(ai: AiLike | undefined, input: ClassifyInput): Promise<AiDecision | null> {
  if (!ai || !input.text.trim()) return null;
  try {
    const call = ai.run(AI_MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt(input) },
      ],
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
      max_tokens: 800,
      temperature: 0.2,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("AI timeout")), AI_TIMEOUT_MS); });
    try {
      return normalize(extractJson(await Promise.race([call, timeout])));
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn("Workers AI classification failed", error);
    return null;
  }
}
