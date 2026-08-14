#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/commit.test.ts`: a commit whose message has a body, so undoing
# it has something to restore beyond a subject line.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

echo "second" >>"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Second commit" --message "Body line for the message"
