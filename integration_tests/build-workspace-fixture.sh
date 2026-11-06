#!/usr/bin/env bash
# shellcheck shell=bash
# Builds the complete fixture tree, including sibling remotes, into a cached archive.
set -euo pipefail

git_bin="$(realpath "$1")"
workspace="$2"
shape="$(realpath "$3")"
archive="$(realpath -m "$4")"
tar_bin="$(realpath "$5")"

state="$(mktemp -d)"
trap 'rm -rf "$state"' EXIT
cd "$state"

# The dugite build is compiled with prefix `/`, so non-builtin subcommands need this.
GIT_EXEC_PATH="$(dirname "$git_bin")/../libexec/git-core"
export GIT_EXEC_PATH
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export HOME="$state"
export GIT_AUTHOR_DATE="2000-01-01T00:00:00Z"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"

mkdir -p "$workspace"
git() { "$git_bin" -C "$workspace" "$@"; }
git init --initial-branch=main
git config user.email "itest@example.invalid"
git config user.name "Integration Test"

# Relative workspace paths keep sibling remote URLs relocatable.
"$shape" "$git_bin" "$workspace"
"$tar_bin" --create --file "$archive" .
