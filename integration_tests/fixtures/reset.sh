#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/reset.test.ts`: a merge commit on top of an ordinary commit, with
# an unstaged modification and an untracked file that undoing either commit must leave alone.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "base" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Base"

git switch --create side
echo "side" >"$workspace/side.txt"
git add side.txt
git commit --message "Side change"

git switch main
echo "main" >>"$workspace/tracked.txt"
git commit --all --message "Main change"

git merge --no-ff side --message "Merge branch 'side'" --message "Merge body line"

echo "unstaged" >>"$workspace/tracked.txt"
echo "untracked" >"$workspace/untracked.txt"
