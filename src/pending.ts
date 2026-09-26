import type { VaultId } from "./config";
import type { AiNote } from "./ai-router";

/**
 * A capture waiting on one question: "personal or work?". Held per chat so the owner answers in
 * plain language instead of re-typing the message behind a command. It stores the note the model
 * already produced, so answering costs no second inference.
 */
export interface PendingCapture {
  text: string;
  forwarded: boolean;
  urls: string[];
  note: AiNote;
  /** The ORIGINAL message, so the answer to the question does not become the note's source. */
  source: { kind: "conversation"; ref: string; date?: string };
  askedAt: number;
}

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Namespaced so it can share OAUTH_KV without colliding with the OAuth provider's own keys. */
const key = (chatId: number) => `telegram:pending:${chatId}`;
export const PENDING_TTL_SECONDS = 600;

export async function putPending(kv: KvLike | undefined, chatId: number, pending: PendingCapture): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key(chatId), JSON.stringify(pending), { expirationTtl: PENDING_TTL_SECONDS });
  } catch (error) {
    console.warn("could not store the pending capture", error);
  }
}

export async function takePending(kv: KvLike | undefined, chatId: number): Promise<PendingCapture | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCapture;
    return parsed?.note?.summary && parsed?.source?.ref ? parsed : null;
  } catch (error) {
    console.warn("could not read the pending capture", error);
    return null;
  }
}

export async function clearPending(kv: KvLike | undefined, chatId: number): Promise<void> {
  if (!kv) return;
  try { await kv.delete(key(chatId)); } catch (error) { console.warn("could not clear the pending capture", error); }
}

export type ClarificationAnswer = VaultId | "cancel" | null;

const PERSONAL_ANSWER = /^(personal[ei]?|priv(ato|ata|ate)?|casa|mio|mia)\b/i;
const WORK_ANSWER = /^(work|lavoro|lavorativ[oa]|ufficio|azienda)\b/i;
const CANCEL_ANSWER = /^(no|lascia (perdere|stare)|annulla|niente|nulla|ignora|cancella|scarta)\b/i;

/**
 * Read a reply to the vault question. Anything else returns null and is treated as a brand new
 * message, so a forgotten pending capture can never swallow what the owner writes next.
 */
export function readClarificationAnswer(text: string): ClarificationAnswer {
  const t = text.trim();
  if (!t || t.length > 40) return null;
  if (CANCEL_ANSWER.test(t)) return "cancel";
  if (WORK_ANSWER.test(t)) return "work";
  if (PERSONAL_ANSWER.test(t)) return "personal";
  return null;
}
