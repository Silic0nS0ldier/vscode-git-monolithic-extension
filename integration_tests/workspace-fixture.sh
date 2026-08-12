#!/usr/bin/env bash
# shellcheck shell=bash
# Creates the git repository that the editor opens during the integration test.
# Run as an `itest_task`; see BUILD.bazel.
set -euo pipefail

git_bin="$(realpath "$1")"
workspace="${TEST_TMPDIR:-/tmp}/$2"

# The test asserts against the same git build, and only this task can resolve its runfile.
printf '%s' "$git_bin" >"${TEST_TMPDIR:-/tmp}/git-bin"

# The dugite build ships its own config; ignore whatever the host has.
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null

rm -rf "$workspace"
mkdir -p "$workspace"

git() { "$git_bin" -C "$workspace" "$@"; }

git init --initial-branch=main
git config user.email "itest@example.invalid"
git config user.name "Integration Test"

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

# Leave the working tree dirty so the SCM view has something to render.
echo "modified" >>"$workspace/tracked.txt"
echo "untracked" >"$workspace/untracked.txt"
