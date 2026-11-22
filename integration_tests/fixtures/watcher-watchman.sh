#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/watcher-watchman.test.ts`.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

mkdir -p "$workspace/.git/info" "$workspace/.vscode"
echo ".vscode/" >>"$workspace/.git/info/exclude"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.watcherBackend": "watchman"
}
JSON

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

