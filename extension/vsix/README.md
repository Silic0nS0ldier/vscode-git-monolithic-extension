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

Requires VSCode 1.145.0 or later. **Git Monolithic History** contributes file, folder and workspace history
to the Explorer's Timeline view, using the stable API without proposed-API permissions.

- File history follows renames, loads in pages, and opens comparisons against the preceding file revision.
- **Open Commit** shows all files changed by a commit, including additions, deletions and renames.
- **Select for Compare**, **Compare with Selected**, **Copy Commit ID** and **Copy Commit Message** are available
  on the relevant Timeline entries. VSCode's **Compare Selected** can also compare file versions from other sources.
  **Pin Current Timeline** keeps the file's history in view while selecting and opening versions.
- **Open Timeline** on an Explorer folder shows that folder's history. **Pin Workspace Timeline** in the Timeline
  title menu combines the histories of the repositories the extension has opened.
- `git_monolithic.timeline.date` selects the committed date (default) or authored date.
  `git_monolithic.timeline.showAuthor` defaults to `true`.
- Staged entries are always shown. `git_monolithic.timeline.showUncommitted` defaults to `false`; enabling it adds
  working-tree entries from the Tracked and Untracked status groups. Live entries reflect the current SCM status
  view, including its large-repository display limits. Their timestamps are refresh/operation times, not an
  audit trail of when changes were made. Live entries and commits share the requested page limit.

Ported from VSCode's Git extension at 1.145.0, with cancellable, output-bounded Git queries and fork-specific
commands, status groups and `gitm` content URIs. Commit views use the public `vscode.changes` command.
The fork does not expose the builtin Git extension's history-details provider API, so hovers show local commit
metadata and statistics, but not third-party avatars, remote action buttons or message-link providers.

## IMPORTANT

### `vscode.git`

VSCode's builtin git support and Git Monolithic cannot be used together.

This extension will be disabled when `git.enabled = true`.

### Windows + Git `>=2.25`

This extension does not currently support Windows with current versions of Git as logic to handle `rev-parse --show-toplevel` changes have not been ported to the new Git CLI interop package.
