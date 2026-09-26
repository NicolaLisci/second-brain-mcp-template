# Windows client setup

Use this only after the Second Brain Worker is deployed.

Replace https://<worker>.<subdomain>.workers.dev/mcp with your real endpoint.

1. Verify Claude Code:
   claude --version

2. Verify network access:
   curl.exe -i https://<worker>.<subdomain>.workers.dev/mcp

3. Register MCP:
   claude mcp add --transport http --scope user second-brain https://<worker>.<subdomain>.workers.dev/mcp

4. Verify:
   claude mcp get second-brain

5. Start Claude Code, run /mcp, choose second-brain and authenticate with the GitHub account configured in ALLOWED_LOGIN.

6. Optional automatic capture:
   merge the hooks object from claude-code.settings.json into %USERPROFILE%\.claude\settings.json.
   Back up the existing file and do not overwrite unrelated settings.

7. Restart Claude Code and test sb_search, sb_get, sb_capture and duplicate handling with harmless data.
