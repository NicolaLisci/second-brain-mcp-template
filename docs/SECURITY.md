# Security model

## Threat boundaries

The system connects AI clients, Cloudflare and GitHub. Treat each boundary deliberately.

## Never commit

Do not commit:

- GitHub PATs;
- OAuth client secrets;
- Telegram bot tokens;
- webhook secrets;
- encryption/HMAC keys;
- a populated `.dev.vars`;
- private company/client identifiers merely for convenience.

## Least privilege

The GitHub PAT should be fine-grained and limited to the two vault repositories.

Required permissions should stay at the minimum necessary for repository content operations.

## OAuth allowlist

`ALLOWED_LOGIN` restricts successful MCP sessions to one configured GitHub login.

This is defense in depth; storage access still uses the Worker-side PAT.

## Vault confidentiality

Vault repositories should normally be private.

Publishing this server template does not imply publishing knowledge.

## Work/personal separation

Treat the work vault as potentially confidential.

A denylist can prevent known professional identifiers from being written to personal. Keep confidential deny terms in the `DENYLIST_TERMS` Cloudflare secret; the checked-in `denylist.txt` should contain only harmless generic examples.

## Public repository checklist

Before publication:

```bash
gitleaks git .
```

or an equivalent secret scanner.

Also search for:

- personal email addresses;
- real Worker URLs;
- GitHub usernames tied to private infrastructure;
- company/client names;
- internal domains;
- repository IDs;
- Cloudflare namespace/account IDs;
- copied chat/session URLs.

A clean current tree is not enough if the repository contains old private Git history. A public template should begin with fresh history.
