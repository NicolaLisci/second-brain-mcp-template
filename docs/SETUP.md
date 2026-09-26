# Guided installation

This guide assumes little prior experience with Cloudflare Workers or MCP.

## 1. Create the two vault repositories

On GitHub create two **private** repositories. Suggested names:

- `second-brain-work`
- `second-brain-personal`

In each repository create:

```text
00 Inbox/
10 Projects/
20 Areas/
30 Resources/
90 System/Templates/
```

Git does not keep empty folders, so place a `.gitkeep` in empty folders if necessary.

Create these four Markdown templates under `90 System/Templates/`:

### Concept.md

```md
---
type: concept
tags: []
---

# {{title}}

## Summary

## Key points

## Related

## Sources
```

### Project.md

```md
---
type: project
status: active
tags: []
---

# {{title}}

## Outcome

## Context

## Next actions

## Related

## Sources
```

### Area.md

```md
---
type: area
tags: []
---

# {{title}}

## Purpose

## Relevant knowledge

## Related

## Sources
```

### Source.md

```md
---
type: source
tags: []
---

# {{title}}

## Summary

## Distilled knowledge

## Related

## Sources
```

The renderer uses the real destination-vault template as the final layout.

## 2. Create a fine-grained GitHub token

In GitHub open Settings → Developer settings → Personal access tokens → Fine-grained tokens.

Give the token access only to the two vault repositories.

Required repository permissions:

- Contents: Read and write
- Metadata: Read-only

Do not save this token in a tracked file.

## 3. Create a GitHub OAuth App

In GitHub open Settings → Developer settings → OAuth Apps → New OAuth App.

You do not know the final Worker URL yet. You can deploy once, then come back and set:

```text
Homepage URL:
https://<worker>.<subdomain>.workers.dev

Authorization callback URL:
https://<worker>.<subdomain>.workers.dev/callback
```

Keep the OAuth Client ID and Client Secret available for the Cloudflare secret setup.

## 4. Install dependencies

From the repository directory:

```bash
npm install
```

Log in to Cloudflare:

```bash
npx wrangler login
```

A browser window opens so you can authorize Wrangler.

## 5. Create Cloudflare KV

Run:

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned namespace ID into `wrangler.jsonc`, replacing:

```text
00000000000000000000000000000000
```

KV stores OAuth grants and short-lived Telegram clarification state. Vault note content is not used as persistent KV storage.

## 6. Configure vault identity

The Worker needs to know where your vaults live.

Set these as Worker secrets/variables during setup:

```text
GITHUB_OWNER=<your GitHub username or organization>
WORK_VAULT_REPO=<work repository name>
PERSONAL_VAULT_REPO=<personal repository name>
VAULT_BRANCH=main
CAPTURE_TIMEZONE=<IANA timezone, for example Europe/Rome or America/New_York>
ALLOWED_LOGIN=<your GitHub username>
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill it locally. The real `.dev.vars` is gitignored.

## 7. Add production secrets

Run one command at a time:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_PAT
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put HMAC_SECRET
npx wrangler secret put ALLOWED_LOGIN
npx wrangler secret put GITHUB_OWNER
npx wrangler secret put WORK_VAULT_REPO
npx wrangler secret put PERSONAL_VAULT_REPO
npx wrangler secret put VAULT_BRANCH
npx wrangler secret put CAPTURE_TIMEZONE
```

Generate the two random secrets locally:

```bash
openssl rand -hex 32
```

Use different values for `COOKIE_ENCRYPTION_KEY` and `HMAC_SECRET`.

If OpenSSL is unavailable, ask your local coding agent to generate cryptographically secure random 32-byte hex values without printing them into shared logs.

## 8. Test before deploy

Run:

```bash
npm run cf-typegen
npm run type-check
npm test
```

Do not deploy until both type checking and tests pass.

## 9. Deploy

Run:

```bash
npx wrangler deploy
```

Wrangler prints the Worker URL. Return to the GitHub OAuth App and ensure the homepage and callback URLs match it.

## 10. Verify the endpoint

Open:

```text
https://<worker>.<subdomain>.workers.dev/mcp
```

Without authentication, the endpoint should not expose the MCP tools directly.

Then connect an MCP-capable client and complete GitHub OAuth.

## 11. Connect a client

See [../client-config/README.md](../client-config/README.md).

Start with one client only. Verify search and capture before configuring additional clients.

## 12. Add private deny terms

The checked-in `denylist.txt` contains harmless examples only.

For real company names, client names or internal identifiers, keep them out of the public repository and store them as a Cloudflare secret:

```bash
npx wrangler secret put DENYLIST_TERMS
```

Enter a comma-separated list, for example:

```text
company-name,internal-project,internal.example
```

At runtime these private terms are combined with the generic checked-in denylist.

## 13. Optional Telegram setup

Create a bot with BotFather and collect:

- bot token;
- your numeric Telegram user ID;
- a random webhook secret.

Store them with:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_ALLOWED_USER_ID
```

Register:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<worker>.<subdomain>.workers.dev/telegram" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

Never commit the token or webhook secret.

## 14. End-to-end verification

Create a harmless test note, search for it, then capture a new durable fact.

Repeat the same capture with similar wording. The system should surface a possible duplicate rather than silently creating another copy.

Finally test one professional statement and one personal statement to confirm the intended vault separation.
