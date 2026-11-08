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

# Folder and file history whose two merged sides interleave by commit date, so a page can end on either side.
# Both sides edit `shared.txt`, at opposite ends so that they merge cleanly.
commit_at() {
    GIT_COMMITTER_DATE="2001-01-01T00:$1:00+00:00" git commit --message "$2"
}
mkdir -p "$workspace/merged"
printf 'base\n' >"$workspace/merged/base.txt"
printf 'top\nmiddle\nbottom\n' >"$workspace/merged/shared.txt"
git add merged
GIT_COMMITTER_DATE="2003-01-01T00:00:00+00:00" git commit --message "Create merged folder"
git branch side
for revision in 1 2 3 4; do
    git switch main
    printf 'main %s\n' "$revision" >>"$workspace/merged/main.txt"
    { printf 'main %s\n' "$revision"; cat "$workspace/merged/shared.txt"; } >"$workspace/merged/shared.new"
    mv "$workspace/merged/shared.new" "$workspace/merged/shared.txt"
    git add merged/main.txt merged/shared.txt
    commit_at "0$((revision * 2 - 1))" "Main $revision"
    git switch side
    printf 'side %s\n' "$revision" >>"$workspace/merged/side.txt"
    printf 'side %s\n' "$revision" >>"$workspace/merged/shared.txt"
    git add merged/side.txt merged/shared.txt
    commit_at "0$((revision * 2))" "Side $revision"
done
git switch main
GIT_COMMITTER_DATE="2001-01-01T00:09:00+00:00" git merge --no-ff --message "Merge side" side
git branch --delete side

# The child's author and commit dates predate its parent's, despite its place in Git history.
printf 'parent\n' >"$workspace/clock.txt"
git add clock.txt
GIT_AUTHOR_DATE="2002-01-04T00:00:00+00:00" GIT_COMMITTER_DATE="2002-01-03T00:00:00+00:00" \
    git commit --message "Clock parent"
printf 'child\n' >>"$workspace/clock.txt"
git add clock.txt
GIT_AUTHOR_DATE="2002-01-02T00:00:00+00:00" GIT_COMMITTER_DATE="2002-01-02T00:00:00+00:00" \
    git commit --message "Clock child"
printf 'future\n' >"$workspace/future.txt"
git add future.txt
GIT_AUTHOR_DATE="2099-01-01T00:00:00+00:00" GIT_COMMITTER_DATE="2099-01-01T00:00:00+00:00" \
    git commit --message "Future change"
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
printf 'staged\n' >>"$workspace/future.txt"
git add future.txt
printf 'working-only\n' >>"$workspace/history/renamed.txt"
printf 'untracked\n' >"$workspace/history/untracked.txt"
