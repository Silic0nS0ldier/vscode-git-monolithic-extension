#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/checkout.test.ts`: `main` with a local branch `topic` that changes
# `shared.txt`, and a branch `feature` that exists only on the remote. The work tree has a
# modification to `shared.txt` that checking out `topic` would overwrite, a modified and a deleted
# tracked file to discard, and an untracked file nothing should touch.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "base" >"$workspace/shared.txt"
echo "committed" >"$workspace/modified.txt"
echo "committed" >"$workspace/deleted.txt"
git add shared.txt modified.txt deleted.txt
git commit --message "Initial commit"

git switch --create topic
echo "topic" >"$workspace/shared.txt"
git commit --all --message "Topic change"
git switch main

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
echo "modified" >>"$workspace/modified.txt"
rm "$workspace/deleted.txt"
echo "untracked" >"$workspace/untracked.txt"
