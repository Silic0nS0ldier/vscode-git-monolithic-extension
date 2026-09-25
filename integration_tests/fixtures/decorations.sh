#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/decorations.test.ts`: one of each decoration, among clean files.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "clean" >"$workspace/clean.txt"
echo "modified" >"$workspace/modified.txt"
echo "staged" >"$workspace/staged.txt"
git add -- clean.txt modified.txt staged.txt
git commit --message "Initial commit"

# Decorations must not wait on the view's layout shift delay, which the test profile turns off.
# The dugite build ships no templates, so `info/` has to be made.
mkdir -p "$workspace/.git/info" "$workspace/.vscode"
echo ".vscode/" >>"$workspace/.git/info/exclude"
echo '{ "git_monolithic.layoutShiftDelay": 900 }' >"$workspace/.vscode/settings.json"

echo "modified" >>"$workspace/modified.txt"
echo "staged" >>"$workspace/staged.txt"
git add -- staged.txt
echo "untracked" >"$workspace/untracked.txt"
