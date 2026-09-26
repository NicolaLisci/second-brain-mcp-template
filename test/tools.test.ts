import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { CaptureDeps } from "../src/capture";
import { registerTools } from "../src/tools";
import { FakeOctokit, FakeVault } from "./fakes";
import { clearSnapshotCache } from "../src/snapshot";

const tpl = (n: string) => readFileSync(new URL(`./fixtures/templates/${n}.md`, import.meta.url), "utf8");
const NOW = new Date("2026-08-29T13:02:00Z");

beforeEach(() => clearSnapshotCache());

/** Minimal stand-in for McpServer: captures registered tools so handlers can be invoked directly. */
class FakeMcpServer {
  tools = new Map<string, { description?: string; inputSchema?: unknown; handler: (...args: any[]) => any }>();
  registerTool(name: string, config: { description?: string; inputSchema?: unknown }, handler: (...args: any[]) => any) {
    this.tools.set(name, { description: config.description, inputSchema: config.inputSchema, handler });
    return { name };
  }
}

function setup() {
  const work = new FakeOctokit();
  const personal = new FakeOctokit();
  for (const ok of [work, personal]) for (const t of ["Concept", "Project", "Area", "Source"]) ok.files.set(`90 System/Templates/${t}.md`, tpl(t));
  work.files.set("30 Resources/Annual capacity.md", "---\ntype: concept\ncreated: 2026-08-01\nupdated: 2026-08-01\n---\n\n# Annual capacity\n\n## Summary\n\nAnnual capacity is 1760 hours.\n[[Tariffe orarie interne]]\n");
  const deps: CaptureDeps = {
    clients: { work: new FakeVault(work, "work"), personal: new FakeVault(personal, "personal") },
    hmacSecret: "s",
    denylist: ["acme"],
    capturedBy: "test",
    now: () => NOW,
  };
  const server = new FakeMcpServer();
  registerTools(server as any, deps);
  return { work, personal, deps, server };
}

describe("registerTools", () => {
  it("registers exactly sb_search, sb_get, sb_capture with descriptions", () => {
    const { server } = setup();
    expect([...server.tools.keys()].sort()).toEqual(["sb_capture", "sb_get", "sb_search"]);
    for (const name of ["sb_search", "sb_get", "sb_capture"]) {
      expect(typeof server.tools.get(name)!.description).toBe("string");
      expect(server.tools.get(name)!.description!.length).toBeGreaterThan(0);
    }
  });

  describe("sb_search", () => {
    it("returns JSON with results", async () => {
      const { server } = setup();
      const res = await server.tools.get("sb_search")!.handler({ query: "capacity", vault: "work", limit: 10 });
      expect(res.isError).toBeUndefined();
      const body = JSON.parse(res.content[0].text);
      expect(Array.isArray(body.results)).toBe(true);
      expect(body.results.some((r: any) => r.path === "30 Resources/Annual capacity.md")).toBe(true);
    });
  });

  describe("sb_get", () => {
    it("returns frontmatter, body and links for an existing note", async () => {
      const { server } = setup();
      const res = await server.tools.get("sb_get")!.handler({ vault: "work", path: "30 Resources/Annual capacity.md" });
      expect(res.isError).toBeUndefined();
      const body = JSON.parse(res.content[0].text);
      expect(body.frontmatter).toMatchObject({ type: "concept" });
      expect(body.body).toContain("Annual capacity is 1760 hours.");
      expect(body.links).toContain("Tariffe orarie interne");
      expect(typeof body.sha).toBe("string");
    });

    it("returns isError for a missing path", async () => {
      const { server } = setup();
      const res = await server.tools.get("sb_get")!.handler({ vault: "work", path: "30 Resources/Nope.md" });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/^not_found:/);
    });
  });

  describe("sb_capture", () => {
    it("on a fresh title returns status created", async () => {
      const { server, work } = setup();
      const res = await server.tools.get("sb_capture")!.handler({
        vault: "work",
        type: "concept",
        title: "Soglia di pareggio make/buy",
        trigger: "auto",
        mode: "check",
        fields: { summary: "Il pareggio è a 1.285 ore.", sources: [{ kind: "conversation", ref: "Sessione 2026-08-29" }] },
      });
      expect(res.isError).toBeUndefined();
      const body = JSON.parse(res.content[0].text);
      expect(body.status).toBe("created");
      expect(work.files.has(body.path)).toBe(true);
    });

    it("on an invalid dedup_token returns isError starting with bad_token:", async () => {
      const { server } = setup();
      const res = await server.tools.get("sb_capture")!.handler({
        vault: "work",
        type: "concept",
        title: "Annual capacity",
        trigger: "auto",
        mode: "new",
        dedup_token: "bad.token",
        fields: { summary: "x", sources: [{ kind: "url", ref: "y" }] },
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/^bad_token:/);
    });
  });
});
