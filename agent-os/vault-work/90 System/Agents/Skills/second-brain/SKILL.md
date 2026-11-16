---
name: second-brain
description: Save information to the owner's second brain (two Obsidian PARA vaults, work and personal, via the second-brain MCP server). Use when explicitly asked to save or note something, AND on your own initiative when a reasoned decision, a lasting constraint, a non-obvious fact, a source worth finding again or a correction on how to work emerges. Triggers; "salva nel second brain", "salva nel SB", "annota che", "ricordati che", "aggiorna la nota su".
---

# Second brain — capture

The authoritative procedure is `90 System/Agents/second-brain.md` in the work
vault (section "Capture"). Read it before writing. This file only helps decide
*whether* to act.

## When to save on your own initiative

Cut rule: **"will the owner look for this in six months?"** If not, it is not a note.

| Save | Do not save |
|---|---|
| Decision taken **and motivated** | Implementation steps, commands, debugging |
| Constraint or rule that holds tomorrow | Transient state ("now it works") |
| Fact not derivable from code or documents | What files or git already record |
| Source worth finding again | Session chatter |
| The owner's correction on how to work | Preferences already recorded |

The dominant risk is saving too much. When in doubt, do not save.

When you save on your own initiative, **say it in one line**, e.g.
`→ SB personal: Concept "Come scelgo i viaggi"`.

## Reminders

- Only through `sb_capture`: `check` first, then `update` or `new` with the
  `dedup_token`.
- Vault from content; **ambiguous → ask**.
- Separate fact / interpretation / idea / decision / action. Never invent sources.
- **Work → personal barrier**: only generalized, non-confidential, never automatic.

Related skills: `second-brain-ask` (retrieval), `second-brain-scan` (folder
inventory), `sb-review` (Inbox promotion).
