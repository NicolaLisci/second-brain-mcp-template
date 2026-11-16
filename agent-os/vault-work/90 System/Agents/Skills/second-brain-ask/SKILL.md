---
name: second-brain-ask
description: Search the owner's second brain (SB) and answer questions already dealt with, citing the source notes. Use when asked what was decided, whether a topic was already handled, or for previously recorded knowledge. Triggers; "cosa avevo deciso su", "l'ho già affrontato", "cerca nel second brain", "cerca nel SB", "cosa dice il vault su".
---

# Second brain — retrieval

The authoritative procedure is `90 System/Agents/second-brain.md` in the work
vault (section "Retrieval").

## Procedure

1. **Search both vaults with `sb_search`, in three passes:**
   - titles and frontmatter;
   - full body text, with synonyms of the question's words;
   - **notes linked via `[[wikilink]]`** from the hits (read them with `sb_get`).

   The third pass is not optional: the note about "how I handle X" is often
   titled with words the question does not contain.
2. **Answer briefly**, citing each claim with the note and its **vault**.
3. If notes from different dates **contradict** each other, say so with the
   dates; do not merge them.

## The failure to avoid

**If nothing is found, say so.** Never answer from general knowledge and
present it as the owner's decision. If you add a general answer, **label it as
yours**.
