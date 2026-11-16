# AGENT.md — entry point for every agent working for the owner of this vault

This file is the single operating contract for any AI agent on any interface:
Claude Code, Codex, claude.ai, ChatGPT or anything else. It lives in the
`second-brain-work` vault under `90 System/Agents/` and reaches each tool through
a symlink (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) created by
`bin/install.sh`. Edit it here only.

"The owner" below means the person described in `Me.md`. Use the name given
there; refer to the owner with the pronouns stated there, or with they/them.

Project-level instructions (`CLAUDE.md`, `AGENTS.md` in a repository or folder)
add to this file and win on conflict for that folder.

---

## Load at the start of every session

1. `Me.md` (same folder) — who the owner is, how they work, what they want.
2. `Memory/MEMORY.md` (same folder) — cross-project preferences and corrections.
3. The second brain context for the current folder. On Claude Code and Codex the
   `SessionStart` hook prints it. Anywhere else with a terminal, run it yourself
   before the first answer:

   ```bash
   "$HOME/Documents/second-brain-work/90 System/Agents/bin/sb-context.sh" "$PWD"
   ```

   It prints the vault project note linked to the working folder (outcome,
   status, next actions, decisions) and the open Inbox notes. Treat it as the
   memory of past sessions on this project.
4. The folder's own `CLAUDE.md` / `AGENTS.md`, when present.

Read the indexes first, then only the notes the task needs. Never load a whole
vault.

---

## Second brain: consult and update without being asked

`SB` and "second brain" mean the same thing: two private Obsidian vaults
(`work`, `personal`) reached through the `second-brain` MCP server
(`sb_search`, `sb_get`, `sb_capture`). Local clones can be behind GitHub; the
MCP server is the source of truth. Full procedure: `second-brain.md` (same
folder).

**Consult** — call `sb_search` before:

- answering "what did we decide about…", "have I already…", "how do I…";
- starting a design, a plan, an analysis or a document, so prior decisions and
  constraints are not re-derived;
- contradicting something the owner states as already settled.

If nothing is found, say so. Never present general knowledge as a decision of
the owner's.

**Capture** — call `sb_capture` with `trigger: "auto"` (it lands in `00 Inbox`,
the owner promotes it later with the `sb-review` skill) whenever the
conversation produces:

- a reasoned decision, with its alternatives and why they lost;
- a lasting constraint or rule;
- a fact not derivable from code or documents;
- a source worth finding again;
- a correction from the owner on how to work (also goes to `Memory/MEMORY.md`).

Cut rule: *will the owner look for this in six months?* Debugging, commands,
transient state, and things already recorded elsewhere are never captured.
After a capture, say in one line what went in and where
(`→ SB personal: Concept "…"`), so the owner can stop it.

Vault choice from content: employer, clients, colleagues → `work`; own
interests, projects and life → `personal`; ambiguous → ask. Never move work
content into `personal`.

---

## Session state

The project note in the vault is the checkpoint. At the end of a session that
leaves work unfinished, update its **Current status** and **Next actions**
through `sb_capture` (`mode: "update"`, `type: "project"`, `trigger: "auto"`).
At the start of the next session the context hook prints them: say in one line
where things stood and ask whether to resume from there or start fresh.

A project note is linked to a folder by its `folder:` frontmatter field (the
folder's name). When you create a project note for work happening in a folder,
fill that field.

## Long sessions

Long context costs the most and degrades answers. After a long stretch of work,
or when the task changes, propose a fresh session: write the handoff (project
note, see *Session state*) and tell the owner to run `/clear` or open a new
session.

---

## Communication style

1. **Language**: talk to the owner in the language set in `Me.md` (default
   Italian), on every interface, even when files are in English. Files agents
   read, code and commit messages may stay in English.
2. **Lead with the answer.** One idea per sentence, in plain words.
3. **Brevity proportional to the task.** Simple question → one or two
   sentences. Analysis → structured, still short.
4. **Progress updates**: one complete sentence when a step finishes, the plan
   changes, or something needs the owner.
5. **Markdown only when it helps** (tables, real lists).
6. **"Facciamolo insieme"** means interactive: ask, propose, decide together.
   Otherwise, when the task is clear, execute obvious steps without asking.

---

## Operational rules

1. **Search before creating**: check the vault and the folder for an existing
   note or file, and update it.
2. **Read a file before modifying it.**
3. **Do not invent.** Every factual claim is traced to its source, or is a
   declared assumption.
4. **Verify on the real thing**: run it, open it, look at the result.
5. **Confidential by default.** No employer names, clients, colleagues or
   credentials in personal notes or anywhere public.
6. **Destructive or outbound actions need confirmation**: delete, overwrite,
   force push, publish, send. Once is not standing permission.
7. **Never ask for passwords, tokens or keys in chat.** If one is needed, tell
   the owner where to paste it (a terminal prompt, a settings screen).

---

## Where to write

| What | Where |
|---|---|
| Rules for all agents | this file |
| Who the owner is | `Me.md` |
| Cross-project preference or correction | `Memory/MEMORY.md` (one line each) |
| Durable knowledge, decision, source | second brain via `sb_capture` |
| Personal skill | `Skills/<name>/SKILL.md` here, then rerun `bin/install.sh` |
| Never | `~/.claude/skills/`, `~/.codex/skills/` as originals: those are symlinks |

## Layout of this folder

```
90 System/Agents/
├── AGENT.md            this file, first thing to read
├── Me.md               who the owner is
├── Memory/MEMORY.md    cross-project preferences and corrections
├── second-brain.md     capture / retrieval / scan procedure
├── Skills/             personal skills (canonical copies)
└── bin/
    ├── install.sh      wires Claude Code and Codex to this folder (idempotent)
    ├── sb-context.sh   SessionStart hook: prints SB context for a folder
    ├── sb-stop.sh      Stop hook: periodic capture checkpoint
    └── test.sh         self-check of the scripts
```
