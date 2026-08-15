#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/untrusted.test.ts`: sibling repositories that the untrusted
# discovery path treats differently. Created before the control repository so the scan
# reaches the skipped ones first.
set -euo pipefail

git_bin="$1"
workspace="$2"

# The workspace folder must not be a repository itself: `Model.openRepository` skips any
# path already covered by an open repository, so a repository here would swallow all of
# the nested ones below.
rm -rf "$workspace/.git"

nested() {
    local dir="$workspace/$1"
    mkdir -p "$dir"
    "$git_bin" -C "$dir" init --initial-branch=main
    "$git_bin" -C "$dir" config user.email "itest@example.invalid"
    "$git_bin" -C "$dir" config user.name "Integration Test"
    echo "tracked" >"$dir/$1.txt"
    "$git_bin" -C "$dir" add "$1.txt"
    "$git_bin" -C "$dir" commit --message "Initial commit"
    echo "more" >>"$dir/$1.txt"
}

# An ordinary repository whose root happens to hold a file named HEAD. That file is all the
# untrusted bare-repository probe looks at before running `rev-parse --show-cdup`, which
# reports an empty path at the top of a work tree too, so the repository is skipped.
nested head-file-repo
echo "ref: refs/heads/main" >"$workspace/head-file-repo/HEAD"

# The case the probe exists for.
"$git_bin" init --bare --initial-branch=main "$workspace/bare.git"

# The control: no HEAD in its root, so it is opened like any other repository, and its
# change is what proves repositories are being discovered at all.
nested plain-repo
