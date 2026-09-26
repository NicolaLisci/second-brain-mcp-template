# Troubleshooting

## The MCP endpoint does not connect

Check the Worker URL and confirm the path ends in `/mcp`.

Then test the URL without authentication. A protected response is expected; a generic 404 usually means the wrong path or deployment.

## OAuth redirects but ends in 403

Verify `ALLOWED_LOGIN` exactly matches the GitHub username used during OAuth.

## OAuth callback mismatch

In the GitHub OAuth App, the callback must be:

```text
https://<worker>.<subdomain>.workers.dev/callback
```

A missing `/callback`, different hostname or stale Worker name will fail.

## GitHub writes fail

Check:

- the PAT has not expired;
- it can access both vault repositories;
- Contents permission is Read and write;
- `GITHUB_OWNER`, repository names and branch are correct.

Rotate the PAT with:

```bash
npx wrangler secret put GITHUB_PAT
```

## Type checking fails on a clean clone

Run:

```bash
npm run cf-typegen
npm run type-check
```

Cloudflare environment types are generated.

## Captures fail because a template is missing

Verify the destination vault contains:

```text
90 System/Templates/Concept.md
90 System/Templates/Project.md
90 System/Templates/Area.md
90 System/Templates/Source.md
```

## Search returns irrelevant notes

Do not immediately lower thresholds. First inspect whether generic/provenance tags dominate the query or whether the source notes have weak titles and summaries.

## Telegram returns 403

Verify both:

- `TELEGRAM_WEBHOOK_SECRET`;
- `TELEGRAM_ALLOWED_USER_ID`.

## Telegram receives messages but does not structure them

Workers AI may be unavailable or the AI binding may be missing. The system should fall back to deterministic behavior.

## Duplicate notes are created

Make sure the client follows the complete `sb_capture` protocol: check first, inspect candidates, then update/new using the dedup token.

## A client can search but cannot capture

Some AI products or workspaces restrict write-capable connectors. Confirm that the client/workspace permits tool writes. The MCP server itself may still be functioning correctly.
