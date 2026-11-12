#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/rebase.test.ts`: a `main` branch with 30 commits ready to rebase
# onto `base`, a `conflicting` branch whose rebase onto `base` stops on a conflict, and
# tracked/untracked files so `git status` exercises stat and untracked-cache updates.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo ".vscode/" >"$workspace/.gitignore"
echo "initial" >"$workspace/conflict.txt"
for i in $(seq 1 10); do
    echo "initial $i" >"$workspace/file-$i.txt"
done
git add .
git commit --message "Initial"

git switch --create base
echo "from base" >"$workspace/conflict.txt"
echo "base change" >"$workspace/base-only.txt"
git add .
git commit --message "Base change"

git switch --create conflicting main
echo "from conflicting" >"$workspace/conflict.txt"
git commit --all --message "Conflicting change"

git switch main
for step in $(seq 1 10); do
    echo "step $step" >"$workspace/file-$step.txt"
    git commit --all --message "Commit $step"
done

git config core.untrackedCache true
mkdir -p "$workspace/untracked-dir"
echo "untracked" >"$workspace/untracked-dir/note.txt"
