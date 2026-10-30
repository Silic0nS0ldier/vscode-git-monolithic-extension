#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/branch.test.ts`: `main` with an existing local branch `existing`, and a
# branch `feature` that exists only on the remote. The work tree has a modification to a tracked
# file that creating a branch must carry over untouched.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "base" >"$workspace/shared.txt"
git add shared.txt
git commit --message "Initial commit"
git branch existing

# A bare repository stands in for a remote; nothing here touches the network.
remote="${workspace}-remote.git"
rm -rf "$remote"
"$git_bin" init --bare --initial-branch=main "$remote"
git remote add origin "$remote"
git push --set-upstream origin main

# Pushing updates `origin/feature`, so only the remote-tracking ref is left once the branch goes.
git switch --create remote-only
echo "feature" >"$workspace/feature.txt"
git add feature.txt
git commit --message "Feature change"
git push origin remote-only:feature
git switch main
git branch --delete --force remote-only

echo "local" >"$workspace/shared.txt"
