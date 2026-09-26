import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { GitHubHandler } from "./github-handler";
import { GitHubVault } from "./github";
import { vaultsFromEnv } from "./config";
import { createOctokit } from "./octokit";
import { handleTelegram } from "./telegram";
import { registerTools } from "./tools";
import { loadDenylist } from "./validate";
import type { Props } from "./utils";
import DENYLIST from "../denylist.txt";

export class SecondBrainMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({ name: "second-brain", version: "0.1.0" });

  async init() {
    if (this.props!.login !== this.env.ALLOWED_LOGIN) {
      // Defence in depth: github-handler already refuses at /callback.
      throw new Error("forbidden");
    }
    const octokit = createOctokit(this.env.GITHUB_PAT);
    registerTools(this.server, {
      clients: { work: new GitHubVault(octokit, "work", vaultsFromEnv(this.env)), personal: new GitHubVault(octokit, "personal", vaultsFromEnv(this.env)) },
      hmacSecret: this.env.HMAC_SECRET,
      denylist: loadDenylist(`${DENYLIST}\n${(this.env.DENYLIST_TERMS || "").replace(/,/g, "\n")}`),
      capturedBy: "mcp",
      now: () => new Date(),
      timezone: this.env.CAPTURE_TIMEZONE || "UTC",
    });
  }
}

const oauthProvider = new OAuthProvider({
  apiHandler: SecondBrainMCP.serve("/mcp"),
  apiRoute: "/mcp",
  authorizeEndpoint: "/authorize",
  clientRegistrationEndpoint: "/register",
  defaultHandler: GitHubHandler as any,
  tokenEndpoint: "/token",
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/telegram" && request.method === "POST") {
      return handleTelegram(request, env as any);
    }
    return oauthProvider.fetch(request, env, ctx);
  },
};
