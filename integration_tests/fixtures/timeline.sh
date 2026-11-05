#!/usr/bin/env bash
# shellcheck shell=bash
set -euo pipefail

git_bin="$1"
workspace="$2"
git() { "$git_bin" -C "$workspace" "$@"; }
export GIT_AUTHOR_DATE="2001-01-01T00:00:00+00:00"

mkdir -p "$workspace/.vscode" "$workspace/history"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.autoRepositoryDetection": false,
    "timeline.pageSize": 5,
    "timeline.pageOnScroll": false
}
JSON
git add .vscode
git commit --message "Configure Timeline fixture"
printf 'original\n' >"$workspace/history/old.txt"
git add history/old.txt
git commit --message "Create original file :sparkles:" --message "The complete commit body."
git mv history/old.txt history/renamed.txt
git commit --message "Rename tracked file"
for revision in $(seq 1 7); do
    printf 'line %s\n' "$revision" >>"$workspace/history/renamed.txt"
    if [[ "$revision" == 7 ]]; then
        printf 'another changed file\n' >"$workspace/other.txt"
        git add other.txt
    fi
    git add history/renamed.txt
    git commit --message "Revision $revision"
done
printf 'staged-only\n' >>"$workspace/history/renamed.txt"
git add history/renamed.txt
printf 'working-only\n' >>"$workspace/history/renamed.txt"
printf 'untracked\n' >"$workspace/history/untracked.txt"
