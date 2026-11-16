---
name: second-brain-scan
description: Go through any folder (documents, PDFs, notes, code, exports) and propose what deserves to enter the second brain, as an inventory approved row by row. Use ONLY on explicit request. Triggers; "scansiona questa cartella", "cosa c'è di utile qui per il second brain", "importa nel SB", "integra nel second brain".
---

# Second brain — folder scan

## The rule that governs everything

**It never starts on its own and never writes directly.** Inventory first, then
the owner's approval row by row, then writing. Writing automatically into a
near-empty vault is the fastest way to pollute it.

## Argument

`/second-brain-scan <path>` — any local folder. Without an argument, ask which one.

## Before reading

1. **Recognise the material.** List and classify: documents (read them, notes
   and decisions first) · code repository (README, CLAUDE.md/AGENTS.md, `docs/`,
   commit log — not all the code) · container of sub-projects (go one level down,
   classify each) · **unclear → ask** instead of reading blindly.
2. **Size it.** Count the units. Above ~30, say how many and propose a subset.
3. **Stay inside the folder**; do not follow symlinks out of it.

Non-text formats (PDF, sheets, slides, audio) are valid sources; use the right
reader. **If a format is unreadable or needs OCR/transcription, flag it in the
inventory instead of inventing its content.**

## Look for only three things

- **unit card**: outcome, why it exists, status, nature of the material;
- **non-obvious decisions and constraints**, with their reasons;
- **reusable concepts** beyond the unit where they were born.

## Then

Produce the table `item → what is worth saving → note type → vault` and
**stop**. Vault from content; doubts stay as **"to decide"**. After approval,
write each approved row with the `second-brain` skill.

**Sensitive content**: never copy secrets, keys, passwords or personal data of
others into a note. For a confidential document, note that it exists and what
it is about, not its content.
