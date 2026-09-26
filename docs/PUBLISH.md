# Publish this template with fresh history

Do not make the original operational repository public.

A public template must start from the sanitized working tree with a new Git history.

## Recommended procedure

From a local clone of the private operational repository:

```bash
git fetch origin shareable-template-snapshot
git switch shareable-template-snapshot

mkdir -p ../second-brain-mcp-template
git archive HEAD | tar -x -C ../second-brain-mcp-template

cd ../second-brain-mcp-template
git init
git add .
git commit -m "Initial public Second Brain MCP template"
```

Run a secret scan before publishing:

```bash
gitleaks git .
```

Also manually search for private names, email addresses, infrastructure identifiers and real endpoint URLs.

Then, with GitHub CLI authenticated:

```bash
gh repo create second-brain-mcp-template --public --source=. --remote=origin --push
```

If you choose another repository name, replace `second-brain-mcp-template`.

## Why not publish the staging branch directly?

The staging branch lives inside the private operational repository and therefore inherits its old Git history. Even if the current files are clean, old commits may contain personal or company-specific metadata.

`git archive` copies only the current sanitized tree. `git init` creates a new history containing only the public template.

## Final checks

Before changing visibility or sharing the public repository:

- no real tokens or secrets;
- no populated `.dev.vars`;
- no personal email addresses in the new history;
- no private company/client names;
- no real Cloudflare namespace IDs;
- no private Worker URLs;
- no private GitHub repository names;
- CI passes.
