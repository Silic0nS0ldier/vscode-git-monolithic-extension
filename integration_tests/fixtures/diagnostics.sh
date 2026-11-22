#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/diagnostics.test.ts`.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

echo "modified" >>"$workspace/tracked.txt"
echo "untracked" >"$workspace/untracked.txt"
