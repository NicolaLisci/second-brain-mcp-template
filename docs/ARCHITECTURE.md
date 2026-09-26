# Architecture

## Components

Second Brain MCP has four layers.

### 1. Clients

MCP-capable AI clients call a small stable tool surface:

- `sb_search`
- `sb_get`
- `sb_capture`

Clients should not implement their own storage logic.

### 2. Cloudflare Worker

The Worker centralizes authentication, search, duplicate handling, rendering and routing.

The MCP service is hosted at `/mcp`.

An optional Telegram webhook provides a conversational mobile entry point.

### 3. GitHub storage

Each vault is a Git repository containing Markdown notes compatible with Obsidian.

The Worker reads and writes through GitHub APIs. This gives version history and avoids introducing a separate database for the knowledge itself.

### 4. Optional Workers AI

Workers AI can classify Telegram messages, choose a vault and structure durable notes.

The system keeps deterministic fallbacks so capture does not depend completely on model availability.

## Why two vaults

The work/personal split is a trust boundary as much as an organizational preference.

A professional note should not silently leak into the personal vault.

The server therefore centralizes routing and can apply a denylist as an additional guard.

## Capture flow

```text
candidate knowledge
      │
      ▼
 sb_capture check
      │
      ├── no plausible duplicate ──► new
      │
      └── candidates
              │
              ▼
            sb_get
              │
              ├── same knowledge ──► update
              └── distinct ────────► new
```

The caller receives a short-lived signed dedup token from the check step. The final write must present the token.

## Rendering

Models do not directly own final Markdown formatting.

The server loads the appropriate template from the destination vault and fills semantic sections. This means vault owners can evolve formatting without rewriting every client prompt.

## Search

Search combines multiple signals such as title, tags, body coverage and GitHub code-search hints.

The implementation intentionally distinguishes duplicate scoring from answer relevance.

## Authentication

Two credentials have different responsibilities:

- GitHub OAuth: who is calling the MCP server;
- fine-grained GitHub PAT: what repositories the Worker may read/write.

The OAuth login is checked against `ALLOWED_LOGIN`.

## State

The Worker is designed to be stateless.

Cloudflare KV is used only for OAuth-related state and short-lived conversational clarification, not as the canonical knowledge store.
