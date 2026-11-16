#!/usr/bin/env bash
# Wire this Mac's agents (Claude Code, Codex) to the AI configuration in this folder.
# Idempotent. Every file it replaces is copied first to ~/.ai-os-backup/<timestamp>/.
# Usage:  "<work vault>/90 System/Agents/bin/install.sh" <second-brain MCP URL>
#   e.g.  .../install.sh https://second-brain.<account>.workers.dev/mcp
set -euo pipefail

MCP_URL="${1:-${SB_MCP_URL:-}}"
[ -n "$MCP_URL" ] || { echo "Usage: install.sh <second-brain MCP URL ending in /mcp>" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 missing: run 'xcode-select --install' first" >&2; exit 1; }

A="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .../90 System/Agents
BK="$HOME/.ai-os-backup/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$BK"
say() { printf '• %s\n' "$*"; }
backup() { [ -e "$1" ] && [ ! -L "$1" ] && { mkdir -p "$BK/$(dirname "${1#$HOME/}")"; cp -a "$1" "$BK/${1#$HOME/}"; } ; true; }
link() {  # link <target> <linkpath>: repoint a stale link; replace a real file/dir only after backing it up
  if [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; then return; fi
  if [ -L "$2" ]; then unlink "$2"; elif [ -e "$2" ]; then backup "$2"; rm -rf "$2"; fi
  mkdir -p "$(dirname "$2")"; ln -s "$1" "$2"; say "link $2"
}
chmod +x "$A/bin/"*.sh

# 1. Global instructions
link "$A/AGENT.md" "$HOME/.claude/CLAUDE.md"
link "$A/AGENT.md" "$HOME/.codex/AGENTS.md"

# 2. Personal skills: one canonical copy in Skills/, symlinked into both tools
for d in "$A/Skills"/*/; do
  s="$(basename "$d")"
  link "$A/Skills/$s" "$HOME/.claude/skills/$s"
  link "$A/Skills/$s" "$HOME/.codex/skills/$s"
done

# 3. Hooks: same scripts for both tools (same stdin JSON, same exit-2 contract)
hooks() {  # hooks <json file> : keep foreign hooks, (re)write ours
  mkdir -p "$(dirname "$1")"; backup "$1"
  python3 - "$A" "$1" <<'PY'
import json, sys, os
A, p = sys.argv[1], sys.argv[2]
OURS = ('/sb-context.sh', '/sb-stop.sh')
d = json.load(open(p)) if os.path.exists(p) else {}
h = d.setdefault('hooks', {})
def keep_foreign(event):
    return [e for e in h.get(event, []) if not any(
        x.get('type') == 'command' and x.get('command', '').rstrip('"').endswith(OURS) for x in e.get('hooks', []))]
h['SessionStart'] = keep_foreign('SessionStart') + [{"matcher": "startup|resume|clear",
    "hooks": [{"type": "command", "command": f'"{A}/bin/sb-context.sh"', "timeout": 15}]}]
h['Stop'] = keep_foreign('Stop') + [{"hooks": [{"type": "command", "command": f'"{A}/bin/sb-stop.sh"', "timeout": 5}]}]
with open(p, 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False); f.write('\n')
PY
  say "hooks in $1"
}
hooks "$HOME/.claude/settings.json"
hooks "$HOME/.codex/hooks.json"

# 4. The second-brain MCP server, for every project
if command -v claude >/dev/null; then
  claude mcp get second-brain >/dev/null 2>&1 \
    || { claude mcp add --transport http --scope user second-brain "$MCP_URL" && say "Claude Code: MCP second-brain added"; }
else say "Claude Code not found: skipped MCP (rerun after installing it)"; fi
if command -v codex >/dev/null; then
  codex mcp list 2>/dev/null | grep -q '^second-brain' \
    || { codex mcp add second-brain --url "$MCP_URL" && say "Codex: MCP second-brain added"; }
else say "Codex not found: skipped MCP (rerun after installing it)"; fi

echo; echo "Done. Backups in $BK"
echo "Next: restart Claude Code and Codex; in Claude Code run /mcp to log in to second-brain."
