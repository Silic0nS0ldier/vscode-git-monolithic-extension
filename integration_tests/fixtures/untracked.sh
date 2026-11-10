#!/usr/bin/env bash
# shellcheck shell=bash
# Repository state for `src/untracked.test.ts`: every shape of untracked file. `git status` collapses each wholly
# untracked folder into one `dir/` entry, while the Untracked group lists the files inside. `vendor/lib` is an
# untracked nested repository, listed as one entry. `logs/` (ignored files only) and `empty/` are not listed.
# Every file has a distinct name, since a row is found by its label.
set -euo pipefail

git_bin="$1"
workspace="$2"

git() { "$git_bin" -C "$workspace" "$@"; }

# Opening only the repositories of open editors keeps `vendor/lib` from becoming a second provider.
# The dugite build ships no templates, so `info/` has to be made.
mkdir -p "$workspace/.git/info" "$workspace/.vscode"
echo ".vscode/" >>"$workspace/.git/info/exclude"
cat >"$workspace/.vscode/settings.json" <<'JSON'
{
    "git_monolithic.autoRepositoryDetection": "openEditors",
    "git_monolithic.detectSubmodules": false
}
JSON

printf '*.log\n' >"$workspace/.gitignore"
mkdir -p "$workspace/partial"
echo "kept" >"$workspace/partial/kept.txt"
git add .gitignore partial/kept.txt
git commit --message "Initial commit"

echo "root" >"$workspace/root.txt"
echo "beside" >"$workspace/partial/beside.txt"

mkdir -p "$workspace/new/deep"
echo "a" >"$workspace/new/a.txt"
echo "b" >"$workspace/new/deep/b.txt"
: >"$workspace/new/.gitignore"

mkdir -p "$workspace/vendor/lib"
echo "lib" >"$workspace/vendor/lib/lib.txt"
"$git_bin" init --initial-branch=main "$workspace/vendor/lib"

# Not a repository, so git walks it like any other folder.
mkdir -p "$workspace/bad"
echo "gitdir: does-not-exist" >"$workspace/bad/.git"
echo "bad" >"$workspace/bad/bad.txt"

mkdir -p "$workspace/logs" "$workspace/empty"
echo "log" >"$workspace/logs/only.log"

# Folder names a pathspec would read as magic, a glob or an option. `ab` and `A` are only reached by a pattern
# match on the others.
while IFS='|' read -r folder file; do
    mkdir -p "$workspace/$folder"
    echo "$file" >"$workspace/$folder/$file"
done <<'NAMES'
:colon|colon.txt
:(icase)magic|magic.txt
*star|star.txt
[ab]|brackets.txt
-dash|dash.txt
sp ace|space.txt
ünï|unicode.txt
ab|ab.txt
A|upper.txt
NAMES
