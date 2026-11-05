#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/untracked-timeout.test.ts`: listing untracked files hangs past
# the git command timeout, while every other status lookup still answers.
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

# Only the untracked walk reads per-directory ignore files, and opening a FIFO with no
# writer blocks, so `ls-files --others --exclude-standard` hangs until it is killed.
mkfifo "$workspace/sub/.gitignore"
