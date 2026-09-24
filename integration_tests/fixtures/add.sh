#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/add.test.ts`: every kind of change `git add` stages, and more
# untracked files than fit on one command line.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

echo "tracked" >"$workspace/tracked.txt"
echo "gone" >"$workspace/gone.txt"
# Only a `--` ahead of the pathspec stops git reading this as an option.
echo "dash" >"$workspace/-dash.txt"
git add -- tracked.txt gone.txt -dash.txt
git commit --message "Initial commit"

# Excluded, so the suite can rewrite its settings without that being a change of its own.
# The dugite build ships no templates, so `info/` has to be made.
mkdir -p "$workspace/.git/info"
echo ".vscode/" >>"$workspace/.git/info/exclude"
mkdir -p "$workspace/.vscode"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.enableSmartCommit": true
}
JSON

echo "modified" >>"$workspace/tracked.txt"
echo "modified" >>"$workspace/-dash.txt"
rm "$workspace/gone.txt"

# The extension hands git absolute paths, so this many clears the 30000 character chunk
# limit whatever directory the workspace lands in.
mkdir -p "$workspace/bulk"
for i in $(seq -w 1 600); do
    echo "$i" >"$workspace/bulk/untracked-with-a-reasonably-long-name-$i.txt"
done
