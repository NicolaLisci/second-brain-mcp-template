#!/usr/bin/env bash
# Self-check: syntax of every script, and the context hook against a throwaway vault pair.
set -euo pipefail
B="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for s in "$B"/*.sh; do bash -n "$s"; done

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
for v in second-brain-work second-brain-personal; do
  mkdir -p "$T/$v/10 Projects" "$T/$v/00 Inbox"; git -C "$T/$v" init -q
done
printf -- '---\ntype: project\nfolder: demo-app\n---\n\n# Demo\n\n## Current status\n\nhalfway\n\n## Notes\n\nhidden\n' > "$T/second-brain-personal/10 Projects/Demo.md"
printf '# Idea in inbox\n' > "$T/second-brain-work/00 Inbox/idea.md"

out="$(SB_WORK_VAULT="$T/second-brain-work" "$B/sb-context.sh" "/x/demo-app")"
grep -q 'halfway' <<<"$out"          || { echo "FAIL: project note not printed"; exit 1; }
! grep -q 'hidden' <<<"$out"         || { echo "FAIL: Notes section leaked"; exit 1; }
grep -q 'Idea in inbox' <<<"$out"    || { echo "FAIL: inbox not listed"; exit 1; }
out="$(SB_WORK_VAULT="$T/second-brain-work" "$B/sb-context.sh" "/x/other")"
grep -q 'No vault project note' <<<"$out" || { echo "FAIL: missing-note hint"; exit 1; }

# Stop hook: silent on turn 1, blocks (exit 2) on turn 6.
export XDG_STATE_HOME="$T/state"
for i in 1 2 3 4 5; do echo '{"session_id":"t","cwd":"/x"}' | "$B/sb-stop.sh"; done
set +e; echo '{"session_id":"t","cwd":"/x"}' | "$B/sb-stop.sh" 2>/dev/null; rc=$?; set -e
[ "$rc" -eq 2 ] || { echo "FAIL: stop hook did not fire on turn 6"; exit 1; }
echo "AI OS self-check passed"
