#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/autofetch.test.ts`: a local bare `origin` whose every branch has
# moved one commit past what the workspace knows. The workspace has `feature` checked out,
# tracks `main`, `feature`, `topic` (as `other`) and `retired` (as `stale`), and has only
# ever seen `untracked` as a remote branch. `retired` is gone from the remote, which is what
# a narrowed fetch has to step over rather than fail on.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

# Starts autofetch in its narrowest mode, and polls fast enough for the suite to switch modes.
mkdir -p "$workspace/.vscode"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.autofetch": "mainAndCurrent",
    "git_monolithic.autofetchPeriod": 1
}
JSON

echo "base" >"$workspace/tracked.txt"
git add tracked.txt .vscode/settings.json
git commit --message "Base"

# Bare repositories stand in for remotes; nothing here touches the network.
origin="${workspace}-origin.git"
rm -rf "$origin"
"$git_bin" init --bare --initial-branch=main "$origin"
git remote add origin "$origin"
git push --set-upstream origin main
git push origin main:feature main:topic main:untracked main:retired
# A remote that was added rather than cloned has no `origin/HEAD` until this sets it.
git remote set-head origin main

git branch --track feature origin/feature
git branch --track other origin/topic
git branch --track stale origin/retired
git checkout feature

"$git_bin" -C "$origin" update-ref -d refs/heads/retired

# Written straight into the remote and then wound back locally, so every tracking ref
# stays on "Base" until something fetches it.
base="$(git rev-parse HEAD)"
for branch in main feature topic untracked; do
    ahead="$(git commit-tree "HEAD^{tree}" -p HEAD -m "Upstream $branch")"
    git push origin "$ahead:refs/heads/$branch"
    git update-ref "refs/remotes/origin/$branch" "$base"
done
