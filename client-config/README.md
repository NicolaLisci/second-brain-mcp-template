# Client configuration

Connect clients only after the Worker itself has been deployed and tested.

In the examples below, replace:

```text
https://<worker>.<subdomain>.workers.dev/mcp
```

with your real MCP endpoint.

## Claude Code

Register the MCP server at user scope:

```bash
claude mcp add --transport http --scope user second-brain https://<worker>.<subdomain>.workers.dev/mcp
```

Then start Claude Code, run `/mcp`, select `second-brain` and authenticate through GitHub.

For automatic durable-memory capture, merge the `hooks` section from `claude-code.settings.json` into:

- macOS/Linux: `~/.claude/settings.json`
- Windows: `%USERPROFILE%\.claude\settings.json`

Do not overwrite unrelated existing settings.

## Codex

Append `codex.config.toml` to the user's Codex configuration and replace the endpoint placeholder.

Append `codex.AGENTS.md` to the user's global AGENTS instructions if automatic capture/retrieval behavior is desired.

## Claude and ChatGPT

Add the deployed MCP server as a custom connector if your plan/workspace supports remote MCP connectors.

Use OAuth when prompted.

Then add the text from `chat-project-instructions.md` to the relevant project/workspace instructions.

Some products or managed workspaces may limit write-capable tools. If search works but capture does not, verify the workspace's connector/tool-write policy.

## Verify

Use a harmless test.

1. Put a note in one vault with a unique phrase.
2. Ask the client to search for that phrase.
3. Ask it to read the returned note.
4. State a durable test decision and ask it to capture it.
5. Repeat the same fact with similar wording and verify duplicate handling.

The system is ready when search, read, capture and duplicate handling all work through one client.
