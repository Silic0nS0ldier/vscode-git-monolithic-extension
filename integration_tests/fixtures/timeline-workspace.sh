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
clone="$workspace/../timeline-clone"
mkdir -p "$secondary"
# `timeline.*` settings are window-scoped, so a multi-root window only reads them from the workspace file.
cat >"$workspace/timeline.code-workspace" <<'JSON'
{
    "folders": [
        { "path": "." },
        { "path": "../timeline-secondary" },
        { "path": "../timeline-worktree" },
        { "path": "../timeline-clone" }
    ],
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

# The worktree tip predates its parent; keep links relative so the archived fixture can be relocated.
git worktree add --relative-paths -b worktree "../timeline-worktree"
printf 'worktree\n' >"$worktree/worktree.txt"
"$git_bin" -C "$worktree" add .
commit_on "2019-01-01T00:00:00+00:00" "$git_bin" -C "$worktree" commit --message "Worktree tip"

# A separate shallow clone shares hashes with the primary repository but has a different history boundary.
"$git_bin" clone --no-local --depth=2 "$workspace" "$clone"
"$git_bin" -C "$clone" remote remove origin
"$git_bin" -C "$clone" config user.name "Clone Author"
"$git_bin" -C "$clone" config user.email "clone@example.invalid"
test "$("$git_bin" -C "$clone" rev-parse --is-shallow-repository)" = "true"
printf 'clone\n' >"$clone/clone.txt"
"$git_bin" -C "$clone" add .
commit_on "2022-01-01T00:00:00+00:00" "$git_bin" -C "$clone" commit --message "Clone repository tip"
shared=$("$git_bin" -C "$clone" rev-parse HEAD^)
tree=$("$git_bin" -C "$clone" rev-parse "$shared^{tree}")
parent=$("$git_bin" -C "$clone" rev-parse "$shared^")
replacement=$(commit_on "2020-01-05T00:00:00+00:00" \
    "$git_bin" -C "$clone" commit-tree "$tree" -p "$parent" -m "Clone replacement for primary tip")
"$git_bin" -C "$clone" replace "$shared" "$replacement"

"$git_bin" -C "$secondary" init --initial-branch=main
"$git_bin" -C "$secondary" config user.name "Secondary Author"
"$git_bin" -C "$secondary" config user.email "secondary@example.invalid"
printf 'secondary\n' >"$secondary/secondary.txt"
"$git_bin" -C "$secondary" add .
commit_on "2021-01-01T00:00:00+00:00" "$git_bin" -C "$secondary" commit --message "Secondary repository root"
printf 'secondary tip\n' >>"$secondary/secondary.txt"
commit_on "2021-01-01T00:00:00+00:00" "$git_bin" -C "$secondary" commit --all --message "Secondary repository tip"
