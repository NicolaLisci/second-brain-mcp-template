import { describe, expect, it } from "vitest";
import { createOctokit } from "../src/octokit";

function stubFetch(status: number, headers: Record<string, string> = {}) {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({ message: "boom" }), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  return { fetchImpl, calls: () => calls };
}

describe("createOctokit", () => {
  it("does not retry 5xx responses (spec §4: fail fast, never hide GitHub errors)", async () => {
    const f = stubFetch(500);
    const octokit = createOctokit("pat", f.fetchImpl);
    await expect(octokit.request("GET /rate_limit")).rejects.toMatchObject({ status: 500 });
    expect(f.calls()).toBe(1);
  });
  it("does not sleep and retry on a secondary rate limit", async () => {
    const f = stubFetch(403, { "retry-after": "60", "x-ratelimit-remaining": "0" });
    const octokit = createOctokit("pat", f.fetchImpl);
    const started = Date.now();
    await expect(octokit.request("GET /rate_limit")).rejects.toMatchObject({ status: 403 });
    expect(f.calls()).toBe(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
