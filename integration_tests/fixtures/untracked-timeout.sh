#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/untracked-timeout.test.ts`: tracked, staged and untracked changes, and an ignore file
# the suite swaps for a FIFO to make the untracked walk, and so `git status`, hang past the git command timeout.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
echo "staged" >"$workspace/staged.txt"
echo "other" >"$workspace/other.txt"
mkdir -p "$workspace/sub"
echo "kept" >"$workspace/sub/kept.txt"
git add tracked.txt staged.txt other.txt sub/kept.txt
git commit --message "Initial commit"

echo "modified" >>"$workspace/tracked.txt"
echo "modified" >>"$workspace/staged.txt"
git add staged.txt
echo "untracked" >"$workspace/untracked.txt"

# Excluded, so the settings are not an untracked file of their own.
# The dugite build ships no templates, so `info/` has to be made.
mkdir -p "$workspace/.git/info"
echo ".vscode/" >>"$workspace/.git/info/exclude"
mkdir -p "$workspace/.vscode"
# Short enough that the suite does not wait out the default 30s.
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.commandTimeout": 5000
}
JSON

# Starts readable, so the repository opens; only the untracked walk reads it.
: >"$workspace/sub/.gitignore"
