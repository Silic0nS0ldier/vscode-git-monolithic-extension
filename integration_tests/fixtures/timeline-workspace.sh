#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

git_bin="$1"
workspace="$2"
git() { "$git_bin" -C "$workspace" "$@"; }
commit_on() {
    export GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1"
    shift
    "$@"
}

secondary="$workspace/../timeline-secondary"
worktree="$workspace/../timeline-worktree"
rm -rf "$secondary" "$worktree"
mkdir -p "$secondary"
# `timeline.*` settings are window-scoped, so a multi-root window only reads them from the workspace file.
cat >"$workspace/timeline.code-workspace" <<'JSON'
{
    "folders": [{ "path": "." }, { "path": "../timeline-secondary" }, { "path": "../timeline-worktree" }],
    "settings": {
        "git_monolithic.autoRepositoryDetection": true,
        "git_monolithic.detectSubmodules": false,
        "timeline.pageSize": 2,
        "timeline.pageOnScroll": false
    }
}
JSON
printf 'root\n' >"$workspace/root.txt"
git add .
commit_on "2020-01-01T00:00:00+00:00" git commit --message "Primary repository root"
for change in 2 3 4; do
    printf 'change %s\n' "$change" >>"$workspace/root.txt"
    commit_on "2020-01-0${change}T00:00:00+00:00" git commit --all --message "Primary repository change $change"
done
printf 'root tip\n' >>"$workspace/root.txt"
commit_on "2020-01-05T00:00:00+00:00" git commit --all --message "Primary repository tip"

# A worktree whose tip is dated before the history it shares, so its log is read through windows of commits the
# primary repository already showed.
git worktree add -b worktree "$worktree"
printf 'worktree\n' >"$worktree/worktree.txt"
"$git_bin" -C "$worktree" add .
commit_on "2019-01-01T00:00:00+00:00" "$git_bin" -C "$worktree" commit --message "Worktree tip"

"$git_bin" -C "$secondary" init --initial-branch=main
"$git_bin" -C "$secondary" config user.name "Secondary Author"
"$git_bin" -C "$secondary" config user.email "secondary@example.invalid"
printf 'secondary\n' >"$secondary/secondary.txt"
"$git_bin" -C "$secondary" add .
commit_on "2021-01-01T00:00:00+00:00" "$git_bin" -C "$secondary" commit --message "Secondary repository root"
printf 'secondary tip\n' >>"$secondary/secondary.txt"
commit_on "2021-01-01T00:00:00+00:00" "$git_bin" -C "$secondary" commit --all --message "Secondary repository tip"
