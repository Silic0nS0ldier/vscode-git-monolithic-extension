#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/diff.test.ts`: a submodule whose committed, staged and working
# tree revisions all differ, so each rendered diff names the pair of commits it spans.
#
# The submodule is the only SCM resource whose editor content comes from `git diff`; every
# other resource is served from an object blob instead.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

# Outside the workspace so it is not itself a change in the repository under test. The
# fixture task owns this path, so a rerun has to clear whatever the last one left.
origin="${TEST_TMPDIR:-/tmp}/diff-submodule-origin"
rm -rf "$origin"
"$git_bin" init --initial-branch=main "$origin"
origin_git() { "$git_bin" -C "$origin" "$@"; }
origin_git config user.email "itest@example.invalid"
origin_git config user.name "Integration Test"

for revision in first second third; do
    echo "$revision" >"$origin/revision.txt"
    origin_git add revision.txt
    origin_git commit --message "$revision"
done

# The submodule is a git repository inside the workspace folder, so both the first-level
# scan and submodule detection would open it as a second SCM provider, which duplicates
# every `sub` row the suite clicks on.
mkdir -p "$workspace/.vscode"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.autoRepositoryDetection": "openEditors",
    "git_monolithic.detectSubmodules": false
}
JSON
git add .vscode/settings.json
git commit --message "Initial commit"

# `submodule add` clones, and cloning over the file transport is refused by default.
git -c protocol.file.allow=always submodule add "$origin" sub

sub_git() { "$git_bin" -C "$workspace/sub" "$@"; }

sub_git checkout --quiet main~2
git add .gitmodules sub
git commit --message "Add submodule"

sub_git checkout --quiet main~1
git add sub

# Leaves `sub` in the Staged group, spanning main~2..main~1, and in the Tracked group,
# spanning main~1..main.
sub_git checkout --quiet main
