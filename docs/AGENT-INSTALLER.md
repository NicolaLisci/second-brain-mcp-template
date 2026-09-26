# Agent installer playbook

You are helping a user install Second Brain MCP. The user may not be technical.

Your job is to make the installation feel like a guided wizard while preserving security.

## Operating mode

- Work through the phases below in order.
- Do not dump the entire installation at once.
- Explain each required browser action in plain language.
- Perform terminal/file operations yourself when tools permit.
- When the user must click something in GitHub or Cloudflare, give exact navigation steps and wait for the result.
- Never ask the user to paste secrets, PATs, OAuth client secrets, Telegram tokens or encryption keys into chat.
- If a secret must be entered, instruct the user to paste it directly into the terminal prompt from `wrangler secret put`.
- Never commit a real `.dev.vars`.
- Never make either knowledge vault public unless the user explicitly understands and requests that.
- Treat work-vault content as potentially confidential.

## Phase 0 — inspect

Before modifying anything:

1. read `README.md`;
2. read `docs/SETUP.md`;
3. inspect `.dev.vars.example`, `wrangler.jsonc`, `src/config.ts`, and `client-config/README.md`;
4. check Node/npm and Wrangler availability;
5. check whether the repository has uncommitted user changes.

Tell the user what will be created: two private vault repos, one Cloudflare Worker, one OAuth App, and optional Telegram.

## Phase 1 — collect only non-secret choices

Ask for or infer:

- GitHub username/organization;
- desired work vault repository name;
- desired personal vault repository name;
- the user's IANA timezone (for example `Europe/Rome`);
- whether Telegram is wanted now or later.

Do not ask for tokens or passwords.

## Phase 2 — vaults

Guide the user to create the two private GitHub repositories if they do not exist.

Create/verify the PARA-style folders and four templates from `docs/SETUP.md`.

Put one harmless sample note in one vault so retrieval can be tested later.

## Phase 3 — GitHub credentials

Guide the user through:

1. a fine-grained PAT restricted to the two vaults;
2. a GitHub OAuth App.

The PAT is storage authorization. OAuth identifies the human connecting to the MCP server. Explain this distinction if the user asks why both exist.

Do not record either secret.

## Phase 4 — Cloudflare

Run or guide:

```bash
npm install
npx wrangler login
npx wrangler kv namespace create OAUTH_KV
```

Update only the KV namespace placeholder in `wrangler.jsonc`.

Use `wrangler secret put` for installation-specific values and secrets. Store confidential work-routing terms in `DENYLIST_TERMS` rather than editing the public denylist.

Generate random keys locally.

## Phase 5 — quality gate

Run:

```bash
npm run cf-typegen
npm run type-check
npm test
```

If something fails, diagnose it before deployment. Do not tell a non-technical user to ignore a failing test.

## Phase 6 — deploy and OAuth callback

Deploy with:

```bash
npx wrangler deploy
```

Capture the resulting Worker URL.

Guide the user back to the OAuth App and set:

```text
Homepage: https://<worker>.<subdomain>.workers.dev
Callback: https://<worker>.<subdomain>.workers.dev/callback
```

Then update the OAuth-related Wrangler secrets if necessary.

## Phase 7 — connect one client

Start with the client the user already uses.

Use `client-config/README.md`.

Complete OAuth and verify:

1. `sb_search` returns the sample note;
2. `sb_get` reads it;
3. `sb_capture` writes a harmless test fact;
4. duplicate capture follows check → update/new.

Do not configure every client until one complete path works.

## Phase 8 — capture policy

Explain the six-month rule in plain language:

> Save something only if future-you is reasonably likely to search for it months from now.

Good captures include decisions, constraints, non-obvious facts, preferences, solved problems, durable configuration, goals and valuable sources.

Do not auto-capture debugging noise, commands, temporary status or small talk.

Verify that work and personal routing fits the user's situation.

## Phase 9 — optional Telegram

Only after MCP works, offer Telegram.

Guide BotFather setup, store secrets with Wrangler, register the webhook and send three tests:

- a durable statement;
- a question;
- a trivial greeting that should not become a note.

## Phase 10 — handoff

Finish by giving the user:

- Worker MCP URL;
- names of the two vault repos;
- which clients are connected;
- whether Telegram is enabled;
- where to rotate the GitHub PAT;
- where to look first when something breaks: `docs/TROUBLESHOOTING.md`.

Do not include secret values in the handoff.
