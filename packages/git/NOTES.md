```sh
# Porcelain stablises API surface (and is versioned)
-z --porcelain
# Reduces number of locks during git operations by avoiding index modifications where possible
# May cause duplicated work
GIT_OPTIONAL_LOCKS=0
# tells git to not prompt if there are problems
GIT_TERMINAL_PROMPT=0
# update-index, sets the index version
# v4 applies compression, which improves load time
--index-version <n>

# Split Index, designed fir very large indexes

# Untracked cache, allows untracked optimisations by checking parent dir which on supported OS will update parent dir
# Only `git status` uses it, and only with no pathspec and a `-u<mode>` matching `status.showUntrackedFiles`
# (`-unormal` by default). `api/status/mod` makes that call; `ls-files --others` never uses the cache, so
# `api/status/untracked` with `paths` only lists the folders `-unormal` collapses.
# The cache is saved to the index opportunistically, so `GIT_OPTIONAL_LOCKS=0` stops it ever being saved, and two
# `git status` at once can each overwrite the other's update. Run one at a time.
git update-index --test-untracked-cache
git config --global core.untrackedCache true

# untracked cache and index format v4
git config feature.manyFiles true
```

A number of API surface changes are locked behind https://github.com/microsoft/vscode/pull/137241

Its much faster to fetch a specific branch e.g. git fetch origin green
should make it easy to do this (in API and eventually in VSCode)
