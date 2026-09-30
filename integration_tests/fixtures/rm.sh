#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/rm.test.ts`: a merge stopped on two deletion conflicts, one
# deleted by the merged branch and one, in a subdirectory, deleted on `main`.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

mkdir -p "$workspace/nested"
echo "base" >"$workspace/deleted-by-them.txt"
echo "base" >"$workspace/nested/deleted-by-us.txt"
git add .
git commit --message "Base"

git switch --create other
git rm deleted-by-them.txt
echo "theirs" >"$workspace/nested/deleted-by-us.txt"
git commit --all --message "Theirs"

git switch main
echo "ours" >"$workspace/deleted-by-them.txt"
git rm nested/deleted-by-us.txt
git commit --all --message "Ours"

# Expected to stop on the conflicts.
if git merge other; then
    echo "the merge was expected to conflict" >&2
    exit 1
fi
