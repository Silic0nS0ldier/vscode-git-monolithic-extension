#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

git_bin="$1"
workspace="$2"
git() { "$git_bin" -C "$workspace" "$@"; }

secondary="$workspace/../timeline-secondary"
mkdir -p "$workspace/.vscode" "$secondary"
export GIT_AUTHOR_DATE="2020-01-01T00:00:00+00:00"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.autoRepositoryDetection": true,
    "git_monolithic.detectSubmodules": false,
    "timeline.pageSize": 2,
    "timeline.pageOnScroll": false
}
JSON
cat >"$workspace/timeline.code-workspace" <<'JSON'
{"folders": [{"path": "."}, {"path": "../timeline-secondary"}]}
JSON
printf 'root\n' >"$workspace/root.txt"
git add .
git commit --message "Primary repository root"
printf 'root tip\n' >>"$workspace/root.txt"
git commit --all --message "Primary repository tip"

export GIT_AUTHOR_DATE="2021-01-01T00:00:00+00:00"
export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
"$git_bin" -C "$secondary" init --initial-branch=main
"$git_bin" -C "$secondary" config user.name "Secondary Author"
"$git_bin" -C "$secondary" config user.email "secondary@example.invalid"
printf 'secondary\n' >"$secondary/secondary.txt"
"$git_bin" -C "$secondary" add .
"$git_bin" -C "$secondary" commit --message "Secondary repository root"
printf 'secondary tip\n' >>"$secondary/secondary.txt"
"$git_bin" -C "$secondary" commit --all --message "Secondary repository tip"
