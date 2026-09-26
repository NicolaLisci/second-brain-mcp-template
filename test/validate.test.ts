import { describe, expect, it } from "vitest";
import { CaptureInputSchema, CaptureError, loadDenylist, validateCapture, type CaptureInput } from "../src/validate";

const base: CaptureInput = {
  vault: "work", type: "concept", title: "T", trigger: "auto", mode: "check",
  fields: { summary: "s", sources: [{ kind: "url", ref: "https://x" }] },
};
const deny = loadDenylist("acme\n# comment\n\nSecretCorp\n");

describe("validateCapture", () => {
  it("parses a minimal valid input with defaults", () => {
    const parsed = CaptureInputSchema.parse({ ...base, mode: undefined });
    expect(parsed.mode).toBe("check");
  });
  it("loads denylist lowercased ignoring comments", () => {
    expect(deny).toEqual(["acme", "secretcorp"]);
  });
  it("rejects blank source refs", () => {
    expect(() => validateCapture({ ...base, fields: { ...base.fields, sources: [{ kind: "url", ref: "  " }] } }, deny))
      .toThrow(CaptureError);
  });
  it("requires at least one source for type source", () => {
    expect(() => validateCapture({ ...base, type: "source", fields: { ...base.fields, sources: [] } }, deny))
      .toThrow(/type "source" requires at least one source/);
  });
  it("requires target_path and dedup_token for update", () => {
    expect(() => validateCapture({ ...base, mode: "update", dedup_token: "t" }, deny)).toThrow(/target_path/);
    expect(() => validateCapture({ ...base, mode: "update", target_path: "x.md" }, deny)).toThrow(/dedup_token/);
  });
  it("requires dedup_token for new", () => {
    expect(() => validateCapture({ ...base, mode: "new" }, deny)).toThrow(/dedup_token/);
  });
  it("blocks denylisted terms only for personal", () => {
    const f = { ...base.fields, summary: "Contratto con ACME" };
    expect(() => validateCapture({ ...base, vault: "work", fields: f }, deny)).not.toThrow();
    expect(() => validateCapture({ ...base, vault: "personal", fields: f }, deny)).toThrow(/work content cannot enter personal.*acme/);
  });
  it("substring match catches false positives (denylist bias toward over-blocking)", () => {
    const deny2 = loadDenylist("project");
    expect(() => validateCapture({ ...base, vault: "personal", fields: { ...base.fields, summary: "projector settings" } }, deny2))
      .toThrow(/cannot enter personal/);
  });
  it("blocks term found only in title", () => {
    expect(() => validateCapture({ ...base, vault: "personal", title: "ACME Corp", fields: base.fields }, deny))
      .toThrow(/cannot enter personal/);
  });
  it("blocks term found only in sources ref", () => {
    expect(() => validateCapture(
      { ...base, vault: "personal", fields: { ...base.fields, sources: [{ kind: "url", ref: "https://acme.com" }] } },
      deny
    )).toThrow(/cannot enter personal/);
  });
  it("blocks term found only in tags", () => {
    expect(() => validateCapture(
      { ...base, vault: "personal", fields: { ...base.fields, tags: ["acme", "other"] } },
      deny
    )).toThrow(/cannot enter personal/);
  });
});
