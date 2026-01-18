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

## IMPORTANT

### `vscode.git`

VSCode's builtin git support and Git Monolithic cannot be used together.

This extension will be disabled when `git.enabled = true`.

### Windows + Git `>=2.25`

This extension does not currently support Windows with current versions of Git as logic to handle `rev-parse --show-toplevel` changes have not been ported to the new Git CLI interop package.
