#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/scm.test.ts`.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

# Leave the working tree dirty so the SCM view has something to render.
echo "modified" >>"$workspace/tracked.txt"
echo "untracked" >"$workspace/untracked.txt"
