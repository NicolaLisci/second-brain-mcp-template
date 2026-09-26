# Quick start

This is the shortest path from a fresh account to a working Second Brain MCP.

## What you are building

You will have:

1. two private GitHub repositories containing Markdown notes;
2. one Cloudflare Worker exposing those notes through MCP;
3. GitHub OAuth so only your account can connect;
4. optional Telegram capture;
5. AI clients such as Claude Code, Codex, Claude or ChatGPT connected to the same memory.

## Recommended route for non-technical users

Install Claude Code or another coding agent, open this repository, and paste:

```text
Read docs/AGENT-INSTALLER.md and guide me through installing this Second Brain.
Do one external step at a time. Explain where to click, wait for my result when a browser action is required,
verify each technical step yourself when you can, and never ask me to paste a secret into chat.
```

The agent should then drive the installation.

## Manual route

If you prefer to do it yourself, follow [SETUP.md](SETUP.md).

## Definition of done

The installation is complete when:

- the Worker deploys successfully;
- visiting the MCP endpoint without authentication produces an auth challenge;
- OAuth accepts your GitHub account and rejects others;
- `sb_search` can find a test note;
- `sb_capture` can create a note in `00 Inbox`;
- a duplicate test asks you to update or create rather than silently duplicating knowledge;
- work content cannot be accidentally routed into personal when denied terms are present.

Telegram is optional and is not required for the MCP server to be considered complete.
