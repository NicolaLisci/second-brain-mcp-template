# Installer playbook (for the agent)

You are installing a second brain and a centralized AI configuration for a
non-technical person on a Mac. Talk to them in Italian. Behave like a wizard:
one external action at a time, verify each step before moving on, run every
command you can run yourself.

Hard rules:

- Never ask for passwords, tokens, secrets or keys in chat. Secrets go into the
  terminal prompt that needs them (e.g. `wrangler secret put`) or a web form.
- Both vault repositories stay **private**.
- Explain any browser step with exact clicks, then wait for "fatto".
- If a step fails, read the error, explain it in one plain sentence, fix it.

## Phase 0 — check the Mac

1. `xcode-select -p` (git and python3). Missing → `xcode-select --install`, wait.
2. `node -v` (≥ 20) and `npm -v`. Missing → guide the install from
   https://nodejs.org (LTS installer).
3. `gh --version`. Missing → it is optional; without it the person creates the
   repositories in the browser.
4. Ask: first name, pronouns, GitHub username (create the account if none),
   timezone (default `Europe/Rome`).

Tell them what will be created: two private GitHub repositories, one free
Cloudflare Worker, one GitHub OAuth App, links from their AI tools to the
configuration.

## Phase 1 — the two vaults

1. Create two **private** GitHub repositories `second-brain-work` and
   `second-brain-personal` (with `gh repo create --private`, or in the browser).
2. Copy `agent-os/vault-work/` and `agent-os/vault-personal/` into
   `~/Documents/second-brain-work` and `~/Documents/second-brain-personal`
   (exactly these paths: the scripts derive one from the other), `git init`,
   first commit, push to the repositories.
3. Optional: open both folders as vaults in Obsidian.

## Phase 2 — the MCP server

The server lives in this same repository (the parent folder of `agent-os/`).

1. From the repository root, follow `docs/AGENT-INSTALLER.md` from **Phase 3**
   onwards (Phase 2, vault creation, is already done here; its templates are
   already in `90 System/Templates/`). Skip Telegram unless asked.
2. Result: a URL like `https://second-brain.<account>.workers.dev/mcp`, and a
   successful test search and test capture.

## Phase 3 — central configuration

1. Interview the person (5–8 short questions, one at a time) and fill
   `~/Documents/second-brain-work/90 System/Agents/Me.md`: who they are, work,
   personal interests, tools, how they like answers. Show the result, apply
   corrections, delete the template comments.
2. Run the self-check, then the installer with the URL from Phase 2:

   ```bash
   cd ~/Documents/second-brain-work/"90 System/Agents"
   bin/test.sh
   bin/install.sh https://second-brain.<account>.workers.dev/mcp
   ```

3. Commit and push the vault (`Me.md` filled in).
4. Tell them to quit and reopen Claude Code (and Codex), run `/mcp`, and log in
   to `second-brain` with GitHub.

## Phase 4 — web and mobile apps

1. **Claude (app/web)**: Settings → Connectors → add a custom connector with the
   MCP URL. Then create a Project "Second brain" and paste `app-web.md` into its
   instructions, after filling the "Chi sono" block from `Me.md`.
2. **ChatGPT**: if their plan supports custom MCP connectors (developer mode),
   add the same URL and paste `app-web.md` into the project or custom
   instructions. Otherwise say so plainly and skip.

## Phase 5 — prove it works

In a **new** Claude Code session in any folder:

1. "salva nel second brain che preferisco risposte brevi" → a note appears in
   `00 Inbox` of the personal vault, announced in one line.
2. "cosa preferisco nelle risposte?" → the answer cites that note.
3. "sb-review" → the note is proposed for promotion.

Then show them the "Uso quotidiano" table in `agent-os/README.md` and stop.
