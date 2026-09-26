import { beforeEach, describe, expect, it } from "vitest";
import { capture } from "../src/capture";
import { VAULTS, type VaultId } from "../src/config";
import { GitHubVault, type VaultClient } from "../src/github";
import { createOctokit } from "../src/octokit";
import { resetSnapshotCache } from "../src/snapshot";
import { searchVault } from "../src/search";

const repos = { ...VAULTS, work: { owner: process.env.SB_TEST_OWNER || "your-github-username", repo: process.env.SB_TEST_REPO || "second-brain-test", branch: process.env.SB_TEST_BRANCH || "main" } };

describe.skipIf(!(process.env.SB_INTEGRATION === "1" && process.env.GITHUB_PAT))(
  "integration: second-brain-test repo",
  () => {
    const octokit = createOctokit(process.env.GITHUB_PAT!);
    const client = new GitHubVault(octokit, "work", repos) as VaultClient & { vault: VaultId };
    const deps = {
      clients: { work: client, personal: client },
      hmacSecret: "int",
      denylist: [],
      capturedBy: "integration",
      now: () => new Date(),
    };
    const stamp = Date.now();

    beforeEach(() => {
      resetSnapshotCache();
    });

    it(
      "two-step protocol: check → candidates → update appends",
      async () => {
        const fields = {
          summary: `Integrazione ${stamp}`,
          sources: [{ kind: "conversation" as const, ref: "integration test" }],
        };
        const c = await capture(
          { vault: "work", type: "concept", title: "Nota esistente", trigger: "auto", mode: "check", fields },
          deps,
        );
        expect(c.status).toBe("candidates");
        if (c.status !== "candidates") throw new Error("expected candidates");
        expect(c.candidates.some((cand) => cand.path === "30 Resources/Nota esistente.md")).toBe(true);

        const u = await capture(
          {
            vault: "work",
            type: "concept",
            title: "Nota esistente",
            trigger: "auto",
            mode: "update",
            target_path: "30 Resources/Nota esistente.md",
            dedup_token: c.dedup_token,
            fields,
          },
          deps,
        );
        expect(u.status).toBe("updated");
        expect((await client.getFile("30 Resources/Nota esistente.md"))!.content).toContain(`Integrazione ${stamp}`);
      },
      60_000,
    );

    it(
      "concurrent captures both land (CAS retry)",
      async () => {
        const mk = (i: number) =>
          capture(
            {
              vault: "work",
              type: "concept",
              title: `Concorrenza ${stamp} ${i}`,
              trigger: "auto",
              mode: "check",
              fields: { summary: `n${i}`, sources: [{ kind: "url" as const, ref: "x" }] },
            },
            deps,
          );
        const [a, b] = await Promise.all([mk(1), mk(2)]);
        expect(a.status).toBe("created");
        expect(b.status).toBe("created");
        if (a.status !== "created" || b.status !== "created") throw new Error("expected created");
        const paths = (await client.listMarkdown()).map((e) => e.path);
        expect(paths).toContain(a.path);
        expect(paths).toContain(b.path);
      },
      60_000,
    );

    it(
      "sb_search-equivalent: searchVault finds the existing note",
      async () => {
        const results = await searchVault(client, "Nota esistente", 5);
        const hit = results.find((r) => r.path === "30 Resources/Nota esistente.md");
        expect(hit).toBeDefined();
        expect(hit!.score).toBeGreaterThanOrEqual(3);
      },
      60_000,
    );
  },
);
