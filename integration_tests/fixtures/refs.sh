#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/refs.test.ts`: one of every ref type, and a branch that is
# ahead of its upstream.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Initial commit"

# Annotated, so `%(objectname)` is the tag object and only `%(*objectname)` is the commit.
git tag --annotate v1.0.0 --message "First release"
git branch feature

# A bare repository stands in for a remote; nothing here touches the network.
remote="${workspace}-remote.git"
rm -rf "$remote"
"$git_bin" init --bare --initial-branch=main "$remote"
git remote add origin "$remote"
git push --set-upstream origin main

# Leaves the branch one commit ahead of its upstream, and the working tree clean.
echo "more" >>"$workspace/tracked.txt"
git commit --all --message "Ahead of origin"
