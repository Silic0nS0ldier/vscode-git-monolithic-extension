#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/stage-merge.test.ts`: a merge stopped on three conflicts, one
# still carrying its markers, one resolved in the work tree but not staged, and one deleted
# on `main` while modified on the merged branch.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

for name in unresolved resolved deleted-by-us; do
    echo "base" >"$workspace/$name.txt"
done
git add .
git commit --message "Base"

git switch --create other
for name in unresolved resolved deleted-by-us; do
    echo "theirs" >"$workspace/$name.txt"
done
git commit --all --message "Theirs"

git switch main
echo "ours" >"$workspace/unresolved.txt"
echo "ours" >"$workspace/resolved.txt"
git rm deleted-by-us.txt
git commit --all --message "Ours"

# Expected to stop on the conflicts.
if git merge other; then
    echo "the merge was expected to conflict" >&2
    exit 1
fi

echo "resolved" >"$workspace/resolved.txt"
