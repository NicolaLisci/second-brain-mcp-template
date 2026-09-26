import { z } from "zod";
import type { CaptureFields } from "./render";

const SourceSchema = z.object({
  kind: z.enum(["url", "path", "jira", "conversation", "person"]),
  ref: z.string(),
  date: z.string().optional(),
});

export const FieldsSchema = z.object({
  summary: z.string().min(1),
  why_it_matters: z.string().optional(),
  fact: z.string().optional(), interpretation: z.string().optional(), idea: z.string().optional(),
  decision: z.string().optional(), action: z.string().optional(),
  related: z.array(z.string()).optional(),
  sources: z.array(SourceSchema),
  tags: z.array(z.string()).optional(),
}) satisfies z.ZodType<CaptureFields>;

export const CaptureInputSchema = z.object({
  vault: z.enum(["work", "personal"]),
  type: z.enum(["concept", "project", "area", "source"]),
  title: z.string().min(1),
  trigger: z.enum(["auto", "explicit"]),
  mode: z.enum(["check", "new", "update"]).default("check"),
  destination: z.enum(["inbox", "para"]).optional(),
  target_path: z.string().optional(),
  dedup_token: z.string().optional(),
  fields: FieldsSchema,
});
export type CaptureInput = z.infer<typeof CaptureInputSchema> & { fields: CaptureFields };

export class CaptureError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "CaptureError"; }
}

export function loadDenylist(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#"));
}

export function validateCapture(input: CaptureInput, denylist: string[]): void {
  const { fields } = input;
  if (input.type === "source" && fields.sources.length === 0)
    throw new CaptureError("missing_source", 'type "source" requires at least one source');
  if (fields.sources.some((s) => !s.ref.trim()))
    throw new CaptureError("blank_source", "every sources[].ref must be non-blank; never invent a source");
  if (input.mode === "update" && !input.target_path)
    throw new CaptureError("missing_target", 'mode "update" requires target_path');
  if ((input.mode === "update" || input.mode === "new") && !input.dedup_token)
    throw new CaptureError("missing_token", `mode "${input.mode}" requires dedup_token from a previous "check" call`);
  if (input.vault === "personal") {
    const text = [input.title, ...Object.values(fields).flat().map((v) => (typeof v === "string" ? v : JSON.stringify(v)))]
      .join("\n").toLowerCase();
    // Substring match is intentional: for a leak guard, over-blocking is the safe failure mode.
    const hit = denylist.find((term) => text.includes(term));
    if (hit) throw new CaptureError("denylist", `work content cannot enter personal (matched "${hit}")`);
  }
}
