# Project knowledge base for coding agents

## Purpose

Second Brain MCP is a Cloudflare Worker that provides one durable memory layer to multiple AI clients.

It connects two GitHub-backed Obsidian vaults:
- work: professional knowledge;
- personal: personal knowledge.

The GitHub owner and repository names are deployment configuration and must never be hardcoded.

## Interfaces

The /mcp endpoint exposes sb_search, sb_get and sb_capture.

GitHub OAuth identifies the human caller. ALLOWED_LOGIN restricts access to the configured account.

A fine-grained GitHub PAT is used separately by the Worker for repository reads and writes.

The optional /telegram entry point supports conversational mobile capture.

## Architectural invariants

### Stateless Worker
Do not rely on a persistent local filesystem. Canonical knowledge lives in GitHub. Short-lived clarification state may live in Cloudflare KV.

### One source of truth for capture policy
Capture conventions belong in src/conventions.ts. Avoid duplicating them across implementation files.

### Duplicate detection is a protocol
sb_capture first checks candidate existing notes. The caller then explicitly chooses update or new with the returned dedup token.

### Vault templates control formatting
Models provide semantic fields. Final Markdown structure comes from 90 System/Templates in the destination vault.

### Related links must resolve
Model-proposed related titles are validated against real vault notes before wikilinks are emitted.

### Provenance is not topic
Capture-origin tags must not dominate semantic search or duplicate scoring.

### AI paths need deterministic fallbacks
Telegram must still behave predictably when Workers AI is unavailable.

## Code map

- src/index.ts: HTTP routing, OAuth and MCP server
- src/tools.ts: MCP tool definitions
- src/capture.ts: dedup protocol and writes
- src/search.ts: retrieval and duplicate scoring
- src/github.ts: GitHub storage adapter
- src/snapshot.ts: parsed vault snapshot/cache
- src/render.ts: template-driven Markdown rendering
- src/frontmatter.ts: frontmatter handling
- src/conventions.ts: durable-memory capture policy
- src/telegram.ts: Telegram orchestration
- src/ai-router.ts: Workers AI classification
- src/vault-context.ts: knowledge context for classification
- src/pending.ts: short-lived clarification state
- src/vault-router.ts: deterministic vault-routing fallback
- src/config.ts: reusable configuration and paths

## Deployment configuration

Deployment-specific values come from the environment:
- GITHUB_OWNER
- WORK_VAULT_REPO
- PERSONAL_VAULT_REPO
- VAULT_BRANCH
- ALLOWED_LOGIN

Secrets are declared by type but values must never be committed.

## Quality gate

Run:
npm install
npm run cf-typegen
npm run type-check
npm test

Then inspect the diff for accidental personal/company data and run a secret scanner.

## Documentation contract

Any setup-affecting change must update docs/SETUP.md, docs/AGENT-INSTALLER.md, .dev.vars.example and relevant client-config files.
