#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/fetch.test.ts`: two local bare repositories stand in for remotes.
# `origin` has moved ahead of what the workspace knows and has dropped a branch the workspace
# still tracks; `secondary` is registered but has never been fetched from.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "base" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Base"

# Bare repositories stand in for remotes; nothing here touches the network.
origin="${workspace}-origin.git"
rm -rf "$origin"
"$git_bin" init --bare --initial-branch=main "$origin"
git remote add origin "$origin"
git push --set-upstream origin main

# Fetched while it exists so the workspace ends up with a remote-tracking ref that the
# remote no longer has, which is what `--prune` is there to clear out.
"$git_bin" -C "$origin" branch retired main
git fetch origin
"$git_bin" -C "$origin" update-ref -d refs/heads/retired

# Parented on the pushed tip and written straight into the remote, so the workspace's
# `refs/remotes/origin/main` stays behind until something fetches.
ahead="$(git commit-tree "HEAD^{tree}" -p HEAD -m "Upstream change")"
git push origin "$ahead:refs/heads/main"
# `git push` advances the tracking ref even when the source is a raw object name, so wind
# it back to leave the workspace unaware of the upstream commit.
git update-ref refs/remotes/origin/main HEAD

# Cloned rather than pushed to, so no `refs/remotes/secondary/*` exists until a fetch that
# covers every remote runs.
secondary="${workspace}-secondary.git"
rm -rf "$secondary"
"$git_bin" clone --bare "$workspace" "$secondary"
git remote add secondary "$secondary"
