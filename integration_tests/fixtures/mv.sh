#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/mv.test.ts`: committed files at the root and in a subdirectory,
# plus one untracked file.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

mkdir -p "$workspace/nested"
echo "tracked" >"$workspace/tracked.txt"
echo "existing" >"$workspace/existing.txt"
echo "inner" >"$workspace/nested/inner.txt"
git add .
git commit --message "Base"

echo "untracked" >"$workspace/untracked.txt"
