# Monolithic Git for VSCode — agent instructions

A fork of VSCode's built-in Git extension (forked 2021-09-08), rebuilt for repositories Git is
slow on. Bazel-first monorepo; TypeScript + a small Rust/wasm package.

See [README.md](README.md) for build/release basics and terminology,
[extension/vsix/README.md](extension/vsix/README.md) for the shipped extension docs,
[packages/git/README.md](packages/git/README.md) + [packages/git/CODE_STYLE.md](packages/git/CODE_STYLE.md)
for the git wrapper's design rules, and [packages/git/NOTES.md](packages/git/NOTES.md) for the
large-repo strategy.

## Layout

```
packages/wasm  (Rust → wasm)  ──▶  packages/git  ──▶  extension  ──▶  extension/vsix
```

- `packages/git` — npm package `monolithic-git-interop`. Pure git-CLI wrapper, **no VSCode
  dependency**. Subpath exports only.
- `extension` — the extension source. `src/main.ts` only re-exports from `src/lifecycle/`.
- `extension/vsix` — manifest, nls, assets. Bazel copies the rollup output in; no TS of its own.
- `build_defs` — custom Bazel rules (`rollup_bundle`, `vsix_package`, `rust_wasm_bindgen`,
  `node_bin`, `git_bin`, `lint`).
- `integration_tests` — headless browser tests driving code-server.

## Commands

```sh
bazel build //...
bazel test  //...                                    # unit + eslint + shellcheck + integration
bazel build //extension/vsix:git_monolithic --stamp  # dev VSIX
dprint fmt                                           # code formatting
knip                                                 # unused exports/deps
jscpd                                                # duplication detector
bazel mod deps --lockfile_mode=update                # after ANY MODULE.bazel edit
```

- Symlink prefix is `.bazel/`, so artifacts are `.bazel/bin/...` and logs `.bazel/testlogs/...`.
  `bazel-bin` does not exist.
- eslint and shellcheck run as `lint_test` targets inside `bazel test`; dprint, knip and jscpd
  do not. Run `dprint fmt` before finishing — CI fails on `dprint check`.
- `--lockfile_mode=error` is on by default; a `MODULE.bazel` edit without a lock update fails.
- Other CLI tools are DotSlash stubs in `.devcontainer/dotslash/` (`buildifier`, `jscpd`,
  `starpls`, `gh`, `node`, `pnpm`, `rustup`) and are also on `PATH` in the devcontainer.

## Conventions

TypeScript (all packages extend the root [tsconfig.json](tsconfig.json), which is `strict` plus
`noUnusedLocals`, `noImplicitReturns`, `verbatimModuleSyntax`, `isolatedModules`):

- ESM everywhere. **Relative imports carry the `.js` extension** (`./git.js`) even in `.ts`
  sources. Node builtins use the `node:` prefix. Cross-package imports use the subpath export
  with no extension (`monolithic-git-interop/api/rev-parse/git-dir`).
- `verbatimModuleSyntax` ⇒ type-only imports must be `import type` / inline `type`.
- **No `enum`.** Use a string-union type plus a `Record` const — see
  [extension/src/api/git.ts](extension/src/api/git.ts).
- ECMAScript private fields (`#field`), not the `private` keyword. Prefer factory functions
  returning object literals over classes.
- `mod.ts` is the barrel-file name.
- Parse strings to numbers with `from_str_radix` from `monolithic-git-wasm` (that is what
  `packages/wasm` exists for), never `Number()`/`parseInt` — they are too permissive on invalid
  input. See [packages/git/src/api/commit.ts](packages/git/src/api/commit.ts).
- `packages/git` **never throws from public API** — it returns `Result` tuples from
  [packages/git/src/func-result.ts](packages/git/src/func-result.ts); use `isOk`/`isErr`/`unwrap`.
  Typed error nesting stays ≤1 level deep (TS performance). Read `CODE_STYLE.md` before touching it.
- Import `debounce`/`throat` from [extension/src/package-patches/](extension/src/package-patches),
  never from the package directly (CJS/ESM interop shims).
- Runtime strings go through `i18n.Translations.*` in
  [extension/src/i18n/l10n.ts](extension/src/i18n/l10n.ts); only manifest `%key%` strings live in
  `extension/vsix/package.nls.json`.
- Formatting is dprint: 4 spaces, LF, 120 columns.

Bazel:

- `srcs` are **globbed**, so adding a source file needs no BUILD edit. Edit BUILD only for a new
  npm dep (`":node_modules/<pkg>"`), a new entry point, a new test suite, or a new package.
- Prefer symbolic macros (`macro(...)`) over legacy macros for new rules — see
  [integration_tests/defs.bzl](integration_tests/defs.bzl).

Fork-specific naming (never use the upstream `git.` namespace):

- Command ids and settings are `git_monolithic.*`; SCM provider id is `gitm`; output channel is
  `"Git Monolithic"`.
- Four SCM groups: `merge`, `index` (labelled _Staged_), `tracked`, `untracked` — upstream has two.
- The extension is **opt-in**: it activates only when VSCode's `git.enabled` is false.

## Adding a command

1. `extension/src/commands/implementations/<name>.ts` (kebab-case) exporting `createCommand(...)`
   that returns a `ScmCommand` with `commandId: makeCommandId("<name>")`.
2. Add to the group `mod.ts` if it lives in a subfolder.
3. Register in [extension/src/commands/register.ts](extension/src/commands/register.ts) — deps are
   passed explicitly, there is no DI container.
4. `extension/vsix/package.json`: `contributes.commands` + `contributes.menus` entries.
5. `extension/vsix/package.nls.json`: `"command.<name>": "..."`.

## Tests

| Pattern                            | Runner                            | Notes                                                                                       |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/**/*.test.ts`                 | ava                               | Unit. Test names are sentences.                                                             |
| `packages/git/src/**/*.it.test.ts` | `node:test`                       | Runs a real git binary; fixtures in `*.it.stub.ts`.                                         |
| `integration_tests/src/*.test.ts`  | `node:test` + playwright over CDP | One `scm_itest(...)` per suite in [integration_tests/defs.bzl](integration_tests/defs.bzl). |

Integration scenarios in a file **share one editor and one repository and run in file order**,
each building on the previous one's state. Assert git ground truth via the CLI
([integration_tests/src/git.ts](integration_tests/src/git.ts)) inside `pollUntil(...)` — the
extension writes asynchronously.

When migrating a git invocation from `extension` into `packages/git`, add the integration test
**first** as a behaviour baseline, then move the code and prove the untouched test still passes.

## Pitfalls

- `python3` is not installed. Script with `node`.
- `node_modules` is produced by **Bazel, not `pnpm install`**. Each buildable package has a
  `"prepare": "sh ../packages/bazelify-node-modules.sh"` script that symlinks it. A new package
  must add that script _and_ be added to both lists in the knip step of
  [.github/workflows/ci.yml](.github/workflows/ci.yml) _and_ to [knip.json](knip.json).
- Dependency version bumps are initiated by Renovate; the `.github/workflows/update_*.mjs`
  scripts only complete the derived half (Bazel pins, digests). Don't hand-edit pinned versions.
- `code-server` lags VSCode, so `engines.vscode` is pinned to it and guarded by
  `//integration_tests:code_server_pin_drift_test`.
- `.shellcheckrc` sets `shell=sh`; add `# shellcheck shell=bash` to bash scripts.
- Telemetry is a no-op `Proxy`, deliberately stubbed rather than removed.

## Working style

Land work as reviewable units: complete one logical change, verify with `bazel test //...` and
`dprint fmt`, then stop for review before starting the next.
