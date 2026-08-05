#!/usr/bin/env bash
# shellcheck shell=bash
# Creates the git repository that the editor opens during the integration test.
# Run as an `itest_task`; see BUILD.bazel.
set -euo pipefail

git_bin="$(realpath "$1")"
workspace="${TEST_TMPDIR:-/tmp}/$2"

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

# Source repository for the clone test, plus an empty directory to clone into. Both
# live outside the opened workspace so cloning does not perturb the SCM view.
clone_source="${workspace}-clone-source"
clone_target="${workspace}-clone-target"

rm -rf "$clone_source" "$clone_target"
mkdir -p "$clone_source" "$clone_target"

"$git_bin" -C "$clone_source" init --initial-branch=main
"$git_bin" -C "$clone_source" config user.email "itest@example.invalid"
"$git_bin" -C "$clone_source" config user.name "Integration Test"
echo "tracked" >"$clone_source/tracked.txt"
"$git_bin" -C "$clone_source" add tracked.txt
"$git_bin" -C "$clone_source" commit --message "Initial commit"
