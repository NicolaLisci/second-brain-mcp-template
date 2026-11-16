#!/usr/bin/env bash
# Print the second-brain context for a working folder.
#
# Used as SessionStart hook by Claude Code (~/.claude/settings.json) and Codex
# (~/.codex/hooks.json); both add stdout to the model context. Any other agent
# can run it by hand:   sb-context.sh [folder]
#
# Input : $1 = working folder, or hook JSON on stdin (field "cwd").
# Output: the vault project note(s) whose `folder:` matches the folder name,
#         the open Inbox notes, and the standing reminder. Portable to macOS.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_VAULT="${SB_WORK_VAULT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
PERSONAL_VAULT="${SB_PERSONAL_VAULT:-${WORK_VAULT%-work}-personal}"
[ -d "$WORK_VAULT/.git" ] || exit 0

if [ -n "${1:-}" ]; then
  cwd="$1"
else
  payload="$(cat 2>/dev/null || true)"
  cwd="$(printf '%s' "$payload" | grep -oE '"cwd"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  [ -n "$cwd" ] || cwd="$PWD"
fi

# Refresh the clones quietly; never block a session on the network (macOS has no `timeout`).
for v in "$WORK_VAULT" "$PERSONAL_VAULT"; do
  [ -d "$v/.git" ] && ( cd "$v" && perl -e 'alarm 8; exec @ARGV' git pull -q --ff-only >/dev/null 2>&1 ) || true
done

case "$cwd" in "$WORK_VAULT"*|"$PERSONAL_VAULT"*) exit 0;; esac
proj="$(basename "$cwd")"

notes=()
while IFS= read -r f; do notes+=("$f"); done < <(grep -lE "^folder:[[:space:]]*\"?${proj}\"?[[:space:]]*$" \
  "$WORK_VAULT/10 Projects"/*.md "$PERSONAL_VAULT/10 Projects"/*.md 2>/dev/null | head -2)

echo "## Second brain — context for \`$proj\`"
echo
if [ ${#notes[@]} -eq 0 ]; then
  echo "No vault project note has \`folder: $proj\`. If this folder is a real project,"
  echo "capture a project note (sb_capture, type project, folder: $proj) the first time something durable emerges."
else
  for f in "${notes[@]}"; do
    echo "### $(basename "${f%.md}")  (\`${f#$HOME/}\`)"
    # Body without frontmatter and without the trailing Notes section; capped.
    awk 'BEGIN{fm=0} NR==1&&/^---$/{fm=1;next} fm==1{if(/^---$/){fm=2};next} /^## Notes/{exit} {print}' "$f" \
      | sed '/^# /d' | awk 'NF||p{print} {p=NF}' | head -90
    echo
  done
fi

inbox=()
for v in "$WORK_VAULT" "$PERSONAL_VAULT"; do
  while IFS= read -r f; do inbox+=("$f"); done < <(ls -1 "$v/00 Inbox"/*.md 2>/dev/null)
done
if [ ${#inbox[@]} -gt 0 ]; then
  echo "### Inbox waiting for promotion (${#inbox[@]}) — run sb-review"
  for f in "${inbox[@]}"; do
    t="$(grep -m1 '^# ' "$f" | sed 's/^# //')"
    echo "- ${t:-$(basename "${f%.md}")}"
  done | head -15
  echo
fi

cat <<'TXT'
Rules (full text in AGENT.md): run `sb_search` before re-deriving a decision; capture
durable decisions, constraints, facts and corrections with `sb_capture` (trigger auto)
and announce each in one line; update the project note's status and next actions
before leaving unfinished work.
TXT
