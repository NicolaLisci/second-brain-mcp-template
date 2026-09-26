import { slugify } from "./config";

const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

interface Payload { v: string; t: string; p: string[]; exp: number }

export async function createDedupToken(secret: string, p: { vault: string; title: string; candidates: string[]; now: Date; ttlMs?: number }): Promise<string> {
  const payload: Payload = { v: p.vault, t: slugify(p.title), p: [...p.candidates].sort(), exp: p.now.getTime() + (p.ttlMs ?? 10 * 60_000) };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyDedupToken(secret: string, token: string, p: { vault: string; title: string; now: Date }): Promise<{ ok: true; candidates: string[] } | { ok: false; reason: string }> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "malformed token" };
  if ((await hmac(secret, body)) !== sig) return { ok: false, reason: "bad signature" };
  let payload: Payload;
  try { payload = JSON.parse(new TextDecoder().decode(unb64u(body))); } catch { return { ok: false, reason: "malformed payload" }; }
  if (payload.exp < p.now.getTime()) return { ok: false, reason: "token expired; repeat mode \"check\"" };
  if (payload.v !== p.vault) return { ok: false, reason: "token issued for another vault" };
  if (payload.t !== slugify(p.title)) return { ok: false, reason: "token issued for another title" };
  return { ok: true, candidates: payload.p };
}
