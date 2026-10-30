#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/commit-identity.test.ts`: one commit, a staged change to commit next,
# and a `pre-commit` hook that rejects every commit while `.git/reject-commit` exists.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

echo "changed" >>"$workspace/tracked.txt"
git add tracked.txt

mkdir -p "$workspace/.git/hooks"
cat >"$workspace/.git/hooks/pre-commit" <<'HOOK'
#!/bin/sh
if [ -e "$(git rev-parse --git-dir)/reject-commit" ]; then
    echo "Commit rejected by the test hook" >&2
    exit 1
fi
HOOK
chmod +x "$workspace/.git/hooks/pre-commit"
touch "$workspace/.git/reject-commit"
