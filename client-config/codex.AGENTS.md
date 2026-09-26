## Second brain

The `second-brain` MCP server is the user's durable knowledge base with separate work and personal vaults.

- Before answering questions about earlier decisions, preferences, configurations or remembered facts, call `sb_search`.
- At the end of a turn containing durable knowledge likely to matter months from now, call `sb_capture` with trigger `auto`.
- Choose `work` for professional knowledge and `personal` for personal knowledge.
- Follow the check → inspect candidates → update/new protocol.
- Never invent sources.
- Never move professional/confidential content into the personal vault.
- Do not capture debugging, commands, temporary status or small talk.
- After capture, report vault and title in one concise line.
