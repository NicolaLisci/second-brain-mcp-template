import { describe, expect, it } from "vitest";
import { VAULTS, vaultsFromEnv, folderFor, templatePath, slugify, inboxPath, explicitPath } from "../src/config";

describe("config", () => {
  it("maps vaults to repos", () => {
    expect(VAULTS.work).toEqual({ owner: "your-github-username", repo: "second-brain-work", branch: "main" });
    expect(VAULTS.personal.repo).toBe("second-brain-personal");
  });
  it("builds deployment vaults from environment", () => {
    expect(vaultsFromEnv({
      GITHUB_OWNER: "example-user",
      WORK_VAULT_REPO: "work-vault",
      PERSONAL_VAULT_REPO: "personal-vault",
      VAULT_BRANCH: "main",
    })).toEqual({
      work: { owner: "example-user", repo: "work-vault", branch: "main" },
      personal: { owner: "example-user", repo: "personal-vault", branch: "main" },
    });
  });
  it("maps type to PARA folder", () => {
    expect(folderFor("project")).toBe("10 Projects");
    expect(folderFor("area")).toBe("20 Areas");
    expect(folderFor("concept")).toBe("30 Resources");
    expect(folderFor("source")).toBe("30 Resources");
  });
  it("builds template path with capitalized type", () => {
    expect(templatePath("concept")).toBe("90 System/Templates/Concept.md");
  });
  it("slugifies titles", () => {
    expect(slugify("Shared costs: annual estimate")).toBe("shared-costs-annual-estimate");
  });
  it("slugify returns fallback for non-ASCII titles", () => {
    expect(slugify("日本語")).toBe("note");
  });
  it("builds inbox path using UTC", () => {
    const d = new Date("2026-08-29T13:02:00Z");
    expect(inboxPath("Nota di prova", d)).toBe("00 Inbox/2026-08-29 1302 nota-di-prova.md");
  });
  it("inboxPath uses 'note' fallback for empty slug", () => {
    const d = new Date("2026-08-29T13:02:00Z");
    expect(inboxPath("", d)).toMatch(/ note\.md$/);
  });
  it("builds explicit path keeping the title, stripping path-unsafe chars", () => {
    expect(explicitPath("concept", "Make/buy: soglia")).toBe("30 Resources/Make-buy - soglia.md");
  });
});

describe("explicitPath edge cases", () => {
  it("falls back to 'note' when the title sanitizes to nothing", () => {
    expect(explicitPath("concept", " ")).toBe("30 Resources/note.md");
    expect(explicitPath("concept", "??")).toBe("30 Resources/note.md");
  });
});
