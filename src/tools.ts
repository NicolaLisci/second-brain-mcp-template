import { CUT_RULE, NEVER_RULES, NOTE_TYPES, vaultScopeLine } from "./conventions";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { capture, type CaptureDeps } from "./capture";
import { extractWikilinks, parseNote } from "./frontmatter";
import { searchVault } from "./search";
import { CaptureError, CaptureInputSchema } from "./validate";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof CaptureError ? `${e.code}: ${e.message}` : `error: ${(e as Error).message}` }] });

export function registerTools(server: McpServer, deps: CaptureDeps) {
  server.registerTool(
    "sb_search",
    {
      description:
        "Search the user's second brain (Obsidian vaults on GitHub). Three passes: titles/frontmatter, full text, one hop of [[wikilinks]]. Use before answering 'what did we decide about…' and before capturing. Returns vault, path, title, type, excerpt, score.",
      inputSchema: {
        query: z.string().min(2),
        vault: z.enum(["work", "personal", "both"]).default("both"),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, vault, limit }) => {
      try {
        const ids = vault === "both" ? (["work", "personal"] as const) : ([vault] as const);
        const all = (await Promise.all(ids.map((id) => searchVault(deps.clients[id], query, limit))))
          .flat()
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return text({ results: all });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "sb_get",
    {
      description:
        "Read one note from a vault: frontmatter, body, outgoing [[wikilinks]] and git sha. Use to inspect dedup candidates before choosing update vs new.",
      inputSchema: {
        vault: z.enum(["work", "personal"]),
        path: z.string(),
      },
    },
    async ({ vault, path }) => {
      try {
        const f = await deps.clients[vault].getFile(path);
        if (!f) return fail(new CaptureError("not_found", `${path} not found in ${vault}`));
        const { frontmatter, body } = parseNote(f.content);
        return text({ path, frontmatter, body, links: extractWikilinks(body), sha: f.sha });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "sb_capture",
    {
      description: [
        `Capture durable knowledge into the second brain. Cut rule: ${CUT_RULE}`,
        `vault is mandatory. ${vaultScopeLine("work")} ${vaultScopeLine("personal")} ${NEVER_RULES.join(" ")}`,
        `type: ${NOTE_TYPES}`,
        "destination: omit it — 'auto' captures land in 00 Inbox and 'explicit' ones in the PARA folder for the type. Pass 'inbox' only for a capture channel whose notes must always be filed later.",
        "Protocol: call with mode 'check' (default). If status is 'candidates', read them with sb_get, then call again with the same title and the returned dedup_token, using mode 'update' + target_path (append to an existing note) or mode 'new' (genuinely new). trigger 'auto' for unprompted captures (lands in 00 Inbox), 'explicit' when the user asked.",
        "Always provide real sources (url/path/jira/conversation/person); never invent one. After a capture, tell the user in one line: vault and title.",
      ].join(" "),
      inputSchema: CaptureInputSchema.shape,
    },
    async (raw) => {
      try {
        return text(await capture(CaptureInputSchema.parse(raw) as any, deps));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
