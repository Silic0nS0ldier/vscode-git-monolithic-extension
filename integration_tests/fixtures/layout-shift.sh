#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/layout-shift.test.ts`: one change, and a long layout shift delay.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add -- tracked.txt
git commit --message "Initial commit"

# Long enough that a second refresh reliably lands while the first is still held back.
# The dugite build ships no templates, so `info/` has to be made.
mkdir -p "$workspace/.git/info" "$workspace/.vscode"
echo ".vscode/" >>"$workspace/.git/info/exclude"
echo '{ "git_monolithic.layoutShiftDelay": 3000 }' >"$workspace/.vscode/settings.json"

echo "modified" >>"$workspace/tracked.txt"
