#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/pull.test.ts`: a local commit and an upstream commit that carry
# the same patch (built with `commit-tree` off a shared base), the way a rebase-and-force-push
# leaves things.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "base" >"$workspace/tracked.txt"
git add tracked.txt
git commit --message "Base"

# A bare repository stands in for a remote; nothing here touches the network.
remote="${workspace}-remote.git"
rm -rf "$remote"
"$git_bin" init --bare --initial-branch=main "$remote"
git remote add origin "$remote"
git push --set-upstream origin main

echo "changed" >"$workspace/tracked.txt"
git commit --all --message "Local pending change"

# Built from the same tree as the commit above but parented on "Base" directly, this carries
# an identical patch under a different hash and message, as a rebase would produce.
equivalent="$(git commit-tree "HEAD^{tree}" -p "HEAD^" -m "Equivalent upstream change")"
git push origin "$equivalent:refs/heads/main"
git fetch origin
