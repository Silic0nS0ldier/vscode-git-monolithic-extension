#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/object.test.ts`: one file whose committed, staged and working
# tree contents all differ, so each side of a diff names where it was read from.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "committed" >"$workspace/both.txt"
git add both.txt
git commit --message "Initial commit"

echo "staged" >"$workspace/both.txt"
git add both.txt

# Leaves `both.txt` in the Staged group and the Tracked group at once.
echo "working" >"$workspace/both.txt"
