# Monolithic Git for VSCode

WIP Git extension for VSCode optimised for working with monolithic repos.

Timeline view is not supported as the API surface is experimental.

- https://github.com/microsoft/vscode/issues/84297
- https://github.com/microsoft/vscode/issues/83995

## Building

```sh
pnpm run vsce package
```

## Terminology

- Tracked Changes - Changes to files already present in the current git commit-ish.
- Untracked Changed - New or previously ignored files which are not currently tracked.
