import { describe, expect, it } from "vitest";
import { createDedupToken, verifyDedupToken } from "../src/dedup";

const secret = "s3cret";
const now = new Date("2026-08-29T13:00:00Z");

describe("dedup token", () => {
  it("round-trips a valid token", async () => {
    const tok = await createDedupToken(secret, { vault: "work", title: "Annual capacity", candidates: ["b.md", "a.md"], now });
    expect(await verifyDedupToken(secret, tok, { vault: "work", title: "annual capacity", now })).toEqual({ ok: true, candidates: ["a.md", "b.md"] });
  });
  it("rejects wrong secret, vault, title, expiry and tampering", async () => {
    const tok = await createDedupToken(secret, { vault: "work", title: "T", candidates: [], now });
    expect((await verifyDedupToken("other", tok, { vault: "work", title: "T", now })).ok).toBe(false);
    expect((await verifyDedupToken(secret, tok, { vault: "personal", title: "T", now })).ok).toBe(false);
    expect((await verifyDedupToken(secret, tok, { vault: "work", title: "Altro", now })).ok).toBe(false);
    expect((await verifyDedupToken(secret, tok, { vault: "work", title: "T", now: new Date(now.getTime() + 11 * 60_000) })).ok).toBe(false);
    expect((await verifyDedupToken(secret, tok + "x", { vault: "work", title: "T", now })).ok).toBe(false);
    expect((await verifyDedupToken(secret, "garbage", { vault: "work", title: "T", now })).ok).toBe(false);
  });
});
