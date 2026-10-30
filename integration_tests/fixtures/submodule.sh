#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/submodule.test.ts`: two submodules, `sub` and `libs/other`, each
# recorded at `main~1` of their origin but checked out at `main`, so both are listed as
# modified in the Tracked group. Discarding a submodule's changes runs `git submodule update`.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

# Outside the workspace so it is not itself a change in the repository under test. The
# fixture task owns this path, so a rerun has to clear whatever the last one left.
origin="${TEST_TMPDIR:-/tmp}/submodule-origin"
rm -rf "$origin"
"$git_bin" init --initial-branch=main "$origin"
origin_git() { "$git_bin" -C "$origin" "$@"; }
origin_git config user.email "itest@example.invalid"
origin_git config user.name "Integration Test"

for revision in first second; do
    echo "$revision" >"$origin/revision.txt"
    origin_git add revision.txt
    origin_git commit --message "$revision"
done

# The first-level scan would open `sub` as a further SCM provider. Submodule detection stays on:
# discarding resolves a submodule root through the submodule's own open repository, and with
# detection off no repository claims the path, so the discard does nothing.
# TODO That is a bug in `Model.getRepository`; once fixed, detection can be turned off here.
mkdir -p "$workspace/.vscode"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.autoRepositoryDetection": "openEditors",
    "git_monolithic.detectSubmodules": true
}
JSON
git add .vscode/settings.json
git commit --message "Initial commit"

for sub in sub libs/other; do
    # `submodule add` clones, and cloning over the file transport is refused by default.
    git -c protocol.file.allow=always submodule add "$origin" "$sub"
    "$git_bin" -C "$workspace/$sub" checkout --quiet main~1
    git add "$sub"
done
git add .gitmodules
git commit --message "Add submodules"

for sub in sub libs/other; do
    "$git_bin" -C "$workspace/$sub" checkout --quiet main
done
