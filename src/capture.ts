import { explicitPath, inboxPath, templatePath, type VaultId } from "./config";
import { createDedupToken, verifyDedupToken } from "./dedup";
import { bumpUpdated } from "./frontmatter";
import type { VaultClient } from "./github";
import { isoDate, renderNote, renderUpdateSection } from "./render";
import { CANDIDATE_THRESHOLD, searchVault, type SearchResult } from "./search";
import { CaptureError, validateCapture, type CaptureInput } from "./validate";

export interface CaptureDeps {
  clients: Record<VaultId, VaultClient & { vault: VaultId }>;
  hmacSecret: string;
  denylist: string[];
  capturedBy: string;
  now: () => Date;
  timezone?: string;
}
export type CaptureResult =
  | { status: "candidates"; candidates: SearchResult[]; dedup_token: string; hint: string }
  | { status: "created"; vault: VaultId; path: string; commit: string; warning?: string }
  | { status: "updated"; vault: VaultId; path: string; commit: string; warning?: string };

export async function capture(input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  validateCapture(input, deps.denylist);
  const client = deps.clients[input.vault];
  const now = deps.now();
  const meta = { capturedBy: deps.capturedBy, trigger: input.trigger, now, timezone: deps.timezone };
  const mode = input.mode ?? "check";

  if (mode === "check") {
    const results = await searchVault(client, `${input.title} ${input.fields.summary}`, 10);
    const candidates = results.filter((r) => r.score >= CANDIDATE_THRESHOLD);
    if (candidates.length) {
      const token = await createDedupToken(deps.hmacSecret, { vault: input.vault, title: input.title, candidates: candidates.map((c) => c.path), now });
      return {
        status: "candidates", candidates, dedup_token: token,
        hint: 'Possible duplicates found. Read them with sb_get, then call sb_capture again with mode "update" + target_path to extend one, or mode "new" if this is genuinely a different note. Pass dedup_token unchanged.',
      };
    }
    return writeNew(input, client, meta, mode);
  }

  const v = await verifyDedupToken(deps.hmacSecret, input.dedup_token!, { vault: input.vault, title: input.title, now });
  if (!v.ok) throw new CaptureError("bad_token", `invalid dedup_token: ${v.reason}`);

  if (mode === "new") return writeNew(input, client, meta, mode);

  if (!v.candidates.includes(input.target_path!))
    throw new CaptureError("bad_token", 'target_path is not among the candidates this token was issued for; repeat mode "check"');
  return writeUpdate(input, client, meta);
}

type Meta = { capturedBy: string; trigger: "auto" | "explicit"; now: Date; timezone?: string };

/** The commit body records who asked for the capture and how — the note body should not carry it. */
function commitMessage(subject: string, meta: Meta): string {
  return `${subject}\n\ncaptured_by: ${meta.capturedBy}\ntrigger: ${meta.trigger}`;
}

/**
 * The template of the requested type, or the Source one when the vault does not carry it.
 * A vault missing `Project.md` should not make every project capture fail: the note lands as a
 * source note, which every vault has, and the caller is told. Only a vault with no `Source.md`
 * either is a real error — at that point there is no format to write, and inventing one is worse.
 */
async function loadTemplate(client: VaultClient, type: CaptureInput["type"]): Promise<{ content: string; type: CaptureInput["type"]; warning?: string }> {
  const f = await client.getFile(templatePath(type));
  if (f) return { content: f.content, type };
  const name = (t: CaptureInput["type"]) => templatePath(t).split("/").pop();
  if (type !== "source") {
    const fallback = await client.getFile(templatePath("source"));
    if (fallback) return {
      content: fallback.content, type: "source",
      warning: `${name(type)} not found in 90 System/Templates: saved as a source note instead`,
    };
  }
  throw new CaptureError("no_template", `template ${name(type)} not found in 90 System/Templates`);
}

async function writeNew(input: CaptureInput, client: VaultClient & { vault: VaultId }, meta: Meta, mode: CaptureInput["mode"]): Promise<CaptureResult> {
  const template = await loadTemplate(client, input.type);
  const type = template.type;
  // `destination` lets a capture CHANNEL decide where its notes land without lying about
  // `trigger`: Telegram is a capture channel, so everything it sends goes to the inbox to be
  // filed later, while an MCP client that says "explicit" still files straight into PARA.
  const toInbox = input.destination ? input.destination === "inbox" : input.trigger === "auto";
  const path = toInbox ? inboxPath(input.title, meta.now, meta.timezone) : explicitPath(type, input.title);
  const content = renderNote(type, template.content, input.title, input.fields, meta);
  let written = path;
  const { sha } = await client.commitFiles({
    message: commitMessage(`Add ${type}: ${input.title}`, meta),
    files: [{ path, content }],
    prepare: async (head) => {
      written = await freePath(client, path, head, toInbox, mode);
      return [{ path: written, content }];
    },
  });
  return { status: "created", vault: client.vault, path: written, commit: sha, ...(template.warning ? { warning: template.warning } : {}) };
}

/**
 * Never overwrite: a name clash gets a -2, -3, … suffix instead.
 * The one case that still errors is a PARA capture that has NOT seen the duplicates yet
 * (mode "check"), where "pick a better title or update the existing note" is the right answer.
 * Once the caller has answered that question with mode "new", refusing would strand the note —
 * which is exactly what a second `/save` of the same text used to do on Telegram. Inbox captures
 * always suffix: two notes written in the same minute are not a conflict to resolve.
 */
const MAX_SUFFIX = 20;
async function freePath(client: VaultClient, path: string, head: string, toInbox: boolean, mode: CaptureInput["mode"]): Promise<string> {
  if (!(await client.getFile(path, head))) return path;
  if (!toInbox && mode !== "new")
    throw new CaptureError("exists", `${path} already exists; use mode "update" with target_path, or mode "new" to file it alongside`);
  for (let i = 2; i <= MAX_SUFFIX; i++) {
    const candidate = path.replace(/\.md$/, `-${i}.md`);
    if (!(await client.getFile(candidate, head))) return candidate;
  }
  throw new CaptureError("exists", `${path} already exists, and so do ${MAX_SUFFIX - 1} suffixed variants`);
}

function validateTargetPath(path: string): void {
  if (!path.endsWith(".md")) throw new CaptureError("bad_target", `target_path must end with .md: ${path}`);
  if (path.startsWith("90 System/") || path.startsWith(".obsidian/") || path.startsWith(".github/"))
    throw new CaptureError("bad_target", `target_path may not point into a system directory: ${path}`);
}

async function writeUpdate(input: CaptureInput, client: VaultClient & { vault: VaultId }, meta: Meta): Promise<CaptureResult> {
  const path = input.target_path!;
  validateTargetPath(path);
  const { sha } = await client.commitFiles({
    message: commitMessage(`Update ${input.type}: ${input.title}`, meta),
    files: [],
    prepare: async (head) => {
      const f = await client.getFile(path, head);
      if (!f) throw new CaptureError("missing_target", `${path} does not exist`);
      const appended = `${f.content.replace(/\n+$/, "")}\n${renderUpdateSection(input.fields, meta)}`;
      return [{ path, content: bumpUpdated(appended, isoDate(meta.now)) }];
    },
  });
  return { status: "updated", vault: client.vault, path, commit: sha };
}
