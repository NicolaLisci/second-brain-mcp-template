# Second Brain MCP

A self-hosted MCP server that gives AI assistants a shared, durable memory backed by two Obsidian-compatible GitHub repositories.

It exposes three core tools:

- `sb_search` — search knowledge across the vaults.
- `sb_get` — read a specific note.
- `sb_capture` — safely create or update durable knowledge.

The server runs on Cloudflare Workers and uses GitHub as storage. Claude Code, Codex, Claude, ChatGPT and an optional Telegram bot can all use the same knowledge base and the same capture rules.

## What this project solves

Without a shared memory layer, every AI client remembers different things and applies different rules. This server centralizes:

- where knowledge is stored;
- how work and personal knowledge are separated;
- duplicate detection;
- note formatting;
- retrieval;
- automatic capture rules;
- authentication.

The result is one Second Brain that multiple AI assistants can read and update consistently.

## Architecture

```text
Claude Code ─┐
Codex ───────┤
Claude ──────┤
ChatGPT ─────┼── MCP / OAuth ── Cloudflare Worker ── GitHub API ── Obsidian vaults
Telegram ────┘                       │
                                    ├── Workers AI (optional)
                                    └── Cloudflare KV
```

The Worker is stateless. Vault content is read and written through the GitHub API; it is not cloned to persistent Worker storage.

## Start here

If you are not a developer, do **not** start by reading the source code.

1. Read [docs/QUICKSTART.md](docs/QUICKSTART.md).
2. Open this repository with an AI coding agent such as Claude Code or Codex.
3. Ask the agent to follow [docs/AGENT-INSTALLER.md](docs/AGENT-INSTALLER.md).
4. The agent should guide you through each external step and verify it before continuing.

Full documentation:

- [Quick start](docs/QUICKSTART.md)
- [Installazione semplice in italiano](docs/INSTALLAZIONE-SEMPLICE-IT.md)
- [Guided installation](docs/SETUP.md)
- [Agent installer playbook](docs/AGENT-INSTALLER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Glossary](docs/GLOSSARY.md)
- [Client configuration](client-config/README.md)

## Prerequisites

You need:

- a GitHub account;
- two GitHub repositories for your vaults, normally one for work and one for personal knowledge;
- a Cloudflare account;
- Node.js and npm on the machine used for setup;
- optionally Telegram if you want mobile capture.

The two vault repositories should contain these folders:

```text
00 Inbox/
10 Projects/
20 Areas/
30 Resources/
90 System/Templates/
```

and these templates:

```text
90 System/Templates/Concept.md
90 System/Templates/Project.md
90 System/Templates/Area.md
90 System/Templates/Source.md
```

Example templates are documented in the setup guide.

## Configuration

Copy:

```bash
cp .dev.vars.example .dev.vars
```

Then fill in your own values.

Important configuration fields:

```text
ALLOWED_LOGIN
GITHUB_OWNER
WORK_VAULT_REPO
PERSONAL_VAULT_REPO
VAULT_BRANCH
CAPTURE_TIMEZONE
DENYLIST_TERMS
```

Secrets must be stored with `wrangler secret put` in production. Never commit `.dev.vars`, tokens, passwords or private URLs containing credentials.

## Local development

```bash
npm install
npm run cf-typegen
npm run type-check
npm test
npm run dev
```

## Deploy

Create a Cloudflare KV namespace, replace `00000000000000000000000000000000` in `wrangler.jsonc`, configure the secrets and deploy:

```bash
npx wrangler deploy
```

Your MCP endpoint will normally be:

```text
https://<your-worker>.<your-subdomain>.workers.dev/mcp
```

An unauthenticated request should return an authentication challenge rather than exposing the tools.

## Optional Telegram capture

The Telegram integration lets you send normal messages to a bot. The Worker can classify the message, choose the correct vault, structure it and save it.

Telegram is optional. The MCP server works without it.

## Public-template safety

This repository is designed to be safe to publish, but every deployment has its own secrets and organizational constraints.

Before making your own fork public:

- run a secret scanner such as Gitleaks;
- keep private deny terms in the `DENYLIST_TERMS` Worker secret rather than committing them;
- verify that no real company/client names were added to examples;
- verify that no Worker URLs, repository names or account IDs identify private infrastructure;
- never commit `.dev.vars`.

See [docs/SECURITY.md](docs/SECURITY.md).

## For agents modifying this project

Read [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) before changing code. They describe invariants that are not obvious from individual files.
