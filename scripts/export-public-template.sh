#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-../second-brain-mcp-template}"

if [ -e "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null || true)" ]; then
  echo "Target directory is not empty: $TARGET" >&2
  exit 1
fi

mkdir -p "$TARGET"
git archive HEAD | tar -x -C "$TARGET"

cd "$TARGET"
git init
git add .
git commit -m "Initial public Second Brain MCP template"

echo
echo "Fresh-history template created at: $(pwd)"
echo "Next: run a secret scan, review the tree, then create/push a public GitHub repository."
