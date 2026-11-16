#!/usr/bin/env bash
# Stop hook (Claude Code and Codex): at intervals during a session, block the
# stop once and ask the agent to run the second-brain capture check.
#
# Turn counting needs no transcript: every Stop event is one assistant turn.
# State lives in $XDG_STATE_HOME/sb/<session_id>. First reminder at turn
# SB_FIRST (default 6), then every SB_EVERY turns (default 12). When the harness
# says stop_hook_active=true we are already inside a continuation: exit 0.
set -uo pipefail

payload="$(cat 2>/dev/null || true)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_VAULT="${SB_WORK_VAULT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
PERSONAL_VAULT="${SB_PERSONAL_VAULT:-${WORK_VAULT%-work}-personal}"
field() { printf '%s' "$payload" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|true|false|null)" | head -1 | sed -E 's/^"[^"]*"[[:space:]]*:[[:space:]]*//; s/^"//; s/"$//'; }

[ "$(field stop_hook_active)" = "true" ] && exit 0
sid="$(field session_id)"; [ -n "$sid" ] || sid="nosession"
cwd="$(field cwd)"; [ -n "$cwd" ] || cwd="$PWD"
case "$cwd" in "$WORK_VAULT"*|"$PERSONAL_VAULT"*) exit 0;; esac

first="${SB_FIRST:-6}"; every="${SB_EVERY:-12}"
dir="${XDG_STATE_HOME:-$HOME/.local/state}/sb"; mkdir -p "$dir"
f="$dir/$sid"
n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 )); printf '%s' "$n" > "$f"
find "$dir" -type f -mtime +7 -delete 2>/dev/null || true

if [ "$n" -eq "$first" ] || { [ "$n" -gt "$first" ] && [ $(( (n - first) % every )) -eq 0 ]; }; then
  cat >&2 <<'TXT'
Second-brain checkpoint (periodic, from the Stop hook). Before stopping, review what this
session produced since the last checkpoint. If it contains a reasoned decision, a lasting
constraint or rule, a domain fact not derivable from code, a source worth finding again, or
a correction from the owner on how to work, capture it now with sb_capture (trigger "auto",
vault by content, real sources) and tell the owner in one line what went in. If the work left
the project in a different state, update the vault project note's status and next actions.
If nothing qualifies, stop again without commenting on this check.
TXT
  exit 2
fi
exit 0
