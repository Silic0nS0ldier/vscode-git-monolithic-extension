#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/stash.test.ts`: two stashes, so listing them has an order to
# get right.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

echo "first" >>"$workspace/tracked.txt"
git stash push --message "First stash"

echo "second" >>"$workspace/tracked.txt"
git stash push --message "Second stash"
