#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/commit-template.test.ts`: a commit template with a comment that
# must not reach the SCM input box.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

cat >"$workspace/.gitmessage" <<'EOF'
Template subject

# This comment explains the template and must not reach the input box.
Template body
EOF

git config commit.template .gitmessage
