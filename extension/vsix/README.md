# Monolithic Git for VSCode

A fork of VSCode's integrated Git support (from 2021-09-08) designed to work better with large repositories that Git is slow to work with.

It brings the following improvements;

- Greatly optimised watcher implementation.
  - When there is a flood of changes (e.g. pulling in new changes, changing branches) it will wait for idle before triggering a refresh.
  - Basic `.gitignore` support. ([`Microsoft/vscode#62725`](https://github.com/Microsoft/vscode/issues/62725))
- Souce control panel has a "grace period" where when files change it will turn gray for a time before actually changing, to prevent misclicks (e.g. due to refresh slowness).
- In the extension log, command logging (started and output) includes the PID to enable correlation.
- The `too many active changes` warning does not block refreshing the source control view.
- When a section of the source control panel approaches the display limit (5000, triggers at 500 in a given section), `(too many files)` will appear in that section to indicate that files may be missing.

Staging of selected source is supported, but limited vs. the builtin implemenation as the API surface has not been marked as stable. That means;

- It will only work if one instance of a given file diff is open.
- Unstaging a selection is not supported.

This extension has undergone significant refactoring. While it may be a fork, it does not "follow" the builtin implementation.

## Timeline

Requires VSCode 1.145.0 or later. **Git Monolithic History** contributes committed file history to the Explorer's
Timeline view, using the stable API without proposed-API permissions. History follows renames, loads in pages, and
opens comparisons against the preceding file revision. VSCode's **Compare Selected** can also compare file versions
from other sources, and **Pin Current Timeline** keeps the file's history in view while selecting versions.

**Open Commit** shows all files changed by a commit, including additions, deletions, renames, and submodules.
**Copy Commit ID** and **Copy Commit Message** are available on committed Timeline entries.
**Select for Compare** and **Compare with Selected** compare two versions of the same file. Selecting an entry from
another file prompts you to select a version of that file instead.
Folders also have a committed Timeline; opening a folder entry shows the entire commit, including changes outside
the folder. Folder history is paged from the original traversal tip and follows Git's topological order.

The Timeline's **Pin Workspace Timeline** action shows committed history across detected repositories. Linked
worktrees using the same Git directories and compatible traversal settings share one topological traversal, so commits
reachable from several worktree tips appear once. Worktrees with relative or ambiguous Git environment overrides that
may resolve to different object or history files remain separate. Separate Git stores, including independent clones
with the same commits, remain separate histories and retain their own shallow boundaries, replacement refs, and
repository attribution. Each store follows Git's traversal order; their interleaving is not guaranteed to be
chronological. Workspace pages retain the captured tips until the Timeline refreshes.

`git_monolithic.timeline.date` selects the committed date (default) or authored date; `git_monolithic.timeline.showAuthor`
defaults to `true`. Topological Git traversal puts descendants before their ancestors when timestamps disagree. VSCode
sorts by the timestamp it displays, so an entry whose timestamp was adjusted to preserve that order is marked
**Date adjusted for Git order**.
Its hover shows the actual author and commit dates; rebases, cherry-picks, merges, or different clocks can cause
dates to diverge from history order.

Staged entries are always shown. `git_monolithic.timeline.showUncommitted` defaults to `false`; enabling it adds
working-tree entries from the Tracked and Untracked status groups. Live entries reflect the current SCM status
view, including its large-repository display limits. Their timestamps are refresh/operation times, not an
audit trail of when changes were made. Live entries and commits share the requested page limit.

Ported from VSCode's Git extension at 1.145.0, with cancellable, output-bounded Git queries and fork-specific
commands and `gitm` content URIs.
The fork does not expose the builtin Git extension's history-details provider API, so hovers show local commit
metadata and statistics, but not third-party avatars, remote action buttons or message-link providers.

## IMPORTANT

### `vscode.git`

VSCode's builtin git support and Git Monolithic cannot be used together.

This extension will be disabled when `git.enabled = true`.

### Windows + Git `>=2.25`

This extension does not currently support Windows with current versions of Git as logic to handle `rev-parse --show-toplevel` changes have not been ported to the new Git CLI interop package.
