#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/unstage.test.ts`: a single root commit, so undoing it leaves no
# branch behind, then a staged modification, a staged new file, a file with both staged and
# unstaged changes, and an untracked file.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "committed" >"$workspace/modified.txt"
echo "committed" >"$workspace/both.txt"
git add modified.txt both.txt
git commit --message "Root commit" --message "Root body line"

echo "staged" >>"$workspace/modified.txt"
echo "staged" >>"$workspace/both.txt"
echo "added" >"$workspace/added.txt"
git add modified.txt both.txt added.txt

echo "unstaged" >>"$workspace/both.txt"
echo "untracked" >"$workspace/untracked.txt"
