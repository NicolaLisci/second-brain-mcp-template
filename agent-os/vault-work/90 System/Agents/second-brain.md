# Second brain — operating procedure for agents

`SB` means "second brain". This procedure is shared by every agent and
versioned in the `second-brain-work` vault. `AGENT.md` holds the contract; this
file holds the detail.

## Vaults

- Work: private GitHub repository `second-brain-work`, branch `main`.
- Personal: private GitHub repository `second-brain-personal`, branch `main`.
- Agents reach the vaults **only** through the `second-brain` MCP server
  (`sb_search`, `sb_get`, `sb_capture`). The server enforces duplicate search,
  templates and atomic commits. Never write vault files directly.

Read the vault's own `AGENTS.md` before writing; it wins over this file.

## What to capture

Cut rule: "will the owner look for this in six months?". Capture reasoned
decisions, lasting constraints, non-obvious facts, sources worth finding again,
and the owner's corrections. Skip debugging, commands, transient state and
anything already recorded elsewhere. When in doubt, do not capture: a noisy
second brain is worth less than a sparse one.

After an automatic capture, tell the owner in one line: vault and note title.

## Automatic flow

- **Session start**: `bin/sb-context.sh` prints the project note whose
  `folder:` matches the current folder, plus the open Inbox notes (Claude Code
  and Codex run it as a `SessionStart` hook).
- **During the session**: `sb_search` before re-deriving a decision;
  `sb_capture` with `trigger: "auto"` when something durable emerges (lands in
  `00 Inbox`).
- **At intervals**: the `Stop` hook (`bin/sb-stop.sh`) asks once for a capture
  check at the 6th turn, then every 12.
- **Before leaving unfinished work**: update the project note's status and
  next actions (`sb_capture`, `mode: "update"`).
- **Human review**: the owner runs the `sb-review` skill to promote Inbox notes.

## Capture

1. Choose the vault from the content: employer/clients/colleagues → work; own
   interests and projects → personal. Ambiguous → ask.
2. Call `sb_capture` with `mode: "check"` (default). If candidates come back,
   read them with `sb_get` and call again with `mode: "update"` + `target_path`
   (correction or addition) or `mode: "new"` (truly new), passing the
   `dedup_token` received.
3. Fill the tool fields (summary, why_it_matters, fact / interpretation / idea /
   decision / action, related, sources, tags). Sources are mandatory and real.
4. `trigger: "auto"` for spontaneous captures, `"explicit"` when the owner asks.

Never delete or move notes without consent. Work knowledge may reach personal
only as generalized, non-confidential learning, and never automatically.

## Retrieval

For "what did I decide about…", use `sb_search` on both vaults in three passes:
titles and frontmatter; full text; notes linked by `[[wikilink]]` from the hits.
Answer briefly, citing each claim with the note and its vault. If notes from
different dates contradict each other, say so with the dates. If nothing is
found, say so; any general answer is labelled as your own.

## Folder scan

Only on explicit request, never writes directly. Inventory first (table
`item → what is worth saving → note type → vault`), then approval row by row,
then capture. Details in the `second-brain-scan` skill.
