import { describe, expect, it } from "vitest";
import { clearPending, PENDING_TTL_SECONDS, putPending, readClarificationAnswer, takePending, type KvLike, type PendingCapture } from "../src/pending";

function fakeKv() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  const kv: KvLike = {
    get: async (k) => store.get(k) ?? null,
    put: async (k, v, o) => { store.set(k, v); ttls.set(k, o?.expirationTtl); },
    delete: async (k) => { store.delete(k); },
  };
  return { kv, store, ttls };
}

const pending: PendingCapture = {
  text: "ho deciso di usare Cloudflare Workers", forwarded: false, urls: [], askedAt: 0,
  source: { kind: "conversation", ref: "telegram:1:2", date: "2026-08-30T00:00:00.000Z" },
  note: { type: "concept", title: "Cloudflare Workers", summary: "Runtime scelto per il progetto.", tags: ["cloudflare"], related: [] },
};

describe("pending captures", () => {
  it("round-trips a capture under a namespaced key with a TTL", async () => {
    const { kv, store, ttls } = fakeKv();
    await putPending(kv, 42, pending);
    expect([...store.keys()]).toEqual(["telegram:pending:42"]);
    expect(ttls.get("telegram:pending:42")).toBe(PENDING_TTL_SECONDS);
    expect(await takePending(kv, 42)).toMatchObject({ note: { title: "Cloudflare Workers" } });
    await clearPending(kv, 42);
    expect(await takePending(kv, 42)).toBeNull();
  });
  it("is a no-op without a KV binding instead of throwing", async () => {
    await expect(putPending(undefined, 1, pending)).resolves.toBeUndefined();
    expect(await takePending(undefined, 1)).toBeNull();
  });
  it("ignores a corrupt or noteless entry", async () => {
    const { kv } = fakeKv();
    await kv.put("telegram:pending:7", "{not json");
    expect(await takePending(kv, 7)).toBeNull();
    await kv.put("telegram:pending:7", JSON.stringify({ text: "x" }));
    expect(await takePending(kv, 7)).toBeNull();
    // a note but no source: the original message is gone, so the capture cannot be attributed
    await kv.put("telegram:pending:7", JSON.stringify({ ...pending, source: undefined }));
    expect(await takePending(kv, 7)).toBeNull();
  });
  it("survives a KV that is down", async () => {
    const broken: KvLike = { get: async () => { throw new Error("kv down"); }, put: async () => { throw new Error("kv down"); }, delete: async () => { throw new Error("kv down"); } };
    await expect(putPending(broken, 1, pending)).resolves.toBeUndefined();
    expect(await takePending(broken, 1)).toBeNull();
    await expect(clearPending(broken, 1)).resolves.toBeUndefined();
  });
});

describe("readClarificationAnswer", () => {
  it("reads the vault the owner names, in either language", () => {
    for (const t of ["personale", "Personal", "privato", "personale!"]) expect(readClarificationAnswer(t)).toBe("personal");
    for (const t of ["lavoro", "Work", "ufficio", "lavoro."]) expect(readClarificationAnswer(t)).toBe("work");
  });
  it("reads a refusal", () => {
    for (const t of ["no", "lascia perdere", "annulla"]) expect(readClarificationAnswer(t)).toBe("cancel");
  });
  it("returns null for anything else, so a new message is never swallowed", () => {
    expect(readClarificationAnswer("ho deciso di usare Workers per il progetto")).toBeNull();
    expect(readClarificationAnswer("personale, ma solo per la parte di casa e non per il resto del progetto")).toBeNull();
    expect(readClarificationAnswer("")).toBeNull();
  });
});
