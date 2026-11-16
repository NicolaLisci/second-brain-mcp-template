---
name: sb-review
description: Review the second-brain Inbox and promote each note into its PARA place, row by row with the owner's approval. Triggers; "sb-review", "svuota l'inbox del SB", "promuovi le note in inbox", "rivedi il second brain".
---

# Second brain — promotion review

Agents capture into `00 Inbox` of the `work` and `personal` vaults without asking
(see `AGENT.md`). This skill is the human gate: nothing leaves the Inbox without
the owner's yes.

1. List the Inbox of both vaults with `sb_search`; read each note with `sb_get`.
2. Present **one table row per note**:
   `note → keep / merge into <existing note> / discard → target folder (10 Projects / 20 Areas / 30 Resources / 40 Archives) → vault`.
   Mark each row **SOLID** (verified, stable) or **PROVISIONAL** (still moving:
   propose leaving it in the Inbox and say why).
3. **Stop and wait for approval row by row. Write nothing before the owner says yes.**
4. On approval: merge or move with `sb_capture` (`mode: "update"`), keeping
   wikilinks valid. If the server cannot move a note, do it in the local clone
   with `git mv`, commit as `sb-review: <what moved>` and push.

If both Inboxes are empty, say so in one line and stop.
