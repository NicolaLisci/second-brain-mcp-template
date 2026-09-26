import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUpstreamAuthToken } from "../src/utils";

afterEach(() => vi.restoreAllMocks());

describe("fetchUpstreamAuthToken", () => {
  it("logs only the status when the exchange fails, never the response body", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response("client_secret=SUPERSECRET&error=bad_verification_code", { status: 401 }));
    const [token, res] = await fetchUpstreamAuthToken({
      client_id: "id", client_secret: "sec", code: "c", redirect_uri: "https://x/cb", upstream_url: "https://github.com/login/oauth/access_token",
    });
    expect(token).toBeNull();
    expect(res!.status).toBe(500);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).not.toContain("SUPERSECRET");
    expect(logged).toContain("401");
    vi.unstubAllGlobals();
  });
});
