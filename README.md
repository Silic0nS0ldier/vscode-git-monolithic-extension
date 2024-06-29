# Monolithic Git for VSCode

A fork of VSCode's integrated Git support (from 2021-09-08) designed to work better with large repositories that Git is slow to work with.

See [`./extension/vsix/README.md`](./extension/vsix/README.md) for more details.

## Building

For development builds
```sh
bazel build //extension/vsix:git_monolithic --stamp
```

For release
1. Increment version in `extension/vsix/package.json`
2. `bazel build //extension/vsix:git_monolithic`

## Terminology

- Tracked Changes - Changes to files already present in the current git commit-ish.
- Untracked Changed - New or previously ignored files which are not currently tracked.

## The List

- `pnpm patch ...` is not working with the workflow in this repo.
  https://github.com/pnpm/pnpm/issues/8257
- `watcher` package type issues.
  https://github.com/fabiospampinato/watcher/issues/33
- ava tests should emit JUnit output
- Timeline view is not supported as the API surface is experimental.
  - https://github.com/microsoft/vscode/issues/84297
  - https://github.com/microsoft/vscode/issues/83995
  - https://github.com/microsoft/vscode/issues/84899
