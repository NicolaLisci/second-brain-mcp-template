# Glossary

**MCP (Model Context Protocol)** — a standard way for an AI client to discover and call external tools.

**Vault** — a folder/repository of Markdown notes, compatible with Obsidian.

**Worker** — the Cloudflare serverless application hosting this MCP server.

**OAuth** — login flow used here to verify which GitHub user is connecting.

**PAT (Personal Access Token)** — GitHub credential used by the Worker to read and write the vault repositories.

**KV** — Cloudflare key-value storage used for OAuth and short-lived conversational state.

**PARA** — organizational model using Projects, Areas, Resources and Archives. This project uses Projects, Areas and Resources plus an Inbox.

**Deduplication** — checking whether new knowledge belongs in an existing note before creating a new one.

**Frontmatter** — YAML metadata at the top of a Markdown note.

**Wikilink** — Obsidian-style link such as `[[Note name]]`.

**Denylist** — terms that block a capture from being written to the personal vault.

**Durable knowledge** — information worth retrieving in the future, rather than transient conversation state.

**Six-month rule** — a simple capture heuristic: save it if future-you is reasonably likely to search for it months from now.
