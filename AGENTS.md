# AGENTS.md

Read CLAUDE.md and docs/ARCHITECTURE.md before changing this project.

This repository is both an implementation and a reusable public template.

Rules:
- Do not introduce account-specific data, real company/client names, private domains, access tokens, user IDs or infrastructure identifiers.
- Installation-specific values belong in environment variables, Wrangler secrets or explicit placeholders.
- Preserve the separation between work and personal vaults.
- Preserve the sb_capture check -> inspect candidates -> update/new protocol.
- Models may propose semantic content but must not invent sources or unverified wikilinks.
- Run npm test and npm run type-check before considering a change complete.
- When setup behavior changes, update docs/SETUP.md and docs/AGENT-INSTALLER.md.

For installing the system for a non-technical user, follow docs/AGENT-INSTALLER.md.
