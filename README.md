# Monolithic Git for VSCode

A fork of VSCode's integrated Git support (from 2021-09-08) designed to work better with large repositories that Git is slow to work with.

[Find it on the VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=siliconsoldier.git-monolithic)

See [`./extension/vsix/README.md`](./extension/vsix/README.md) for more details.

## Building

For development builds

```sh
bazel build //extension/vsix:git_monolithic \
  --stamp
```

For release

1. Increment version in `extension/vsix/package.json`
2. ```sh
   bazel build //extension/vsix:git_monolithic \
     --config=release
   ```

## Dependency updates

Direct npm dependencies and pnpm catalogs use exact versions. Renovate preserves these pins, and
`pnpm add` saves exact versions. Workspace references and compatibility ranges (such as engines and
peer dependencies) remain ranges; package extensions describe indirect dependencies.

Renovate waits three days before proposing updates. pnpm enforces the same delay (`minimumReleaseAge: 4320`,
in minutes), including for indirect dependencies and lockfile generation, and fails rather than falling
back to releases that are too recent. Keep both configurations aligned. Version-specific exceptions in
`pnpm-workspace.yaml` are reserved for intentional security fixes or workarounds.

## Terminology

- Tracked Changes - Changes to files already present in the current git commit-ish.
- Untracked Changed - New or previously ignored files which are not currently tracked.

## The List

- `watcher` package type issues.
  https://github.com/fabiospampinato/watcher/issues/33
- ava tests should emit JUnit output
- Timeline view is not supported as the API surface is experimental.
  - https://github.com/microsoft/vscode/issues/84297
  - https://github.com/microsoft/vscode/issues/83995
  - https://github.com/microsoft/vscode/issues/84899
