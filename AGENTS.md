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
- `packages/vscode-manifest` — npm package `monolithic-vscode-manifest`. Models the manifest, nls
  and command registrations/references in source (with locations), and checks they agree. Used
  only by tests and tooling ([extension/src/manifest.test.ts](extension/src/manifest.test.ts)).
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
  `gh`, `node`, `pnpm`, `rustup`) and are also on `PATH` in the devcontainer.

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
- Import `debounce` from [extension/src/package-patches/](extension/src/package-patches),
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

1. `extension/vsix/package.json`: `contributes.commands` + `contributes.menus` entries.
2. `extension/vsix/package.nls.json`: `"command.<name>": "..."`.
3. `bazel run //extension:update_command_names` to regenerate
   [command-names.gen.ts](extension/src/commands/command-names.gen.ts) (`CommandName`, the declared
   ids). A diff test fails while it is stale.
4. `extension/src/commands/implementations/<name>.ts` (kebab-case) exporting `createCommand(...)`
   that returns a `ScmCommand<"<name>">` with `commandId: makeCommandId("<name>")`.
5. Add to the group `mod.ts` if it lives in a subfolder.
6. Register in [extension/src/commands/register.ts](extension/src/commands/register.ts) — deps are
   passed explicitly, there is no DI container.

`makeCommandId` only accepts declared names, so use it for references too (`executeCommand`,
`command:` properties) rather than raw `"git_monolithic.*"` strings. `register.ts` fails to
compile, naming the command, if a declared command is not registered; group `mod.ts` factories
must not annotate their return type, or the names are widened and that check is lost.

`//extension:tests` also checks menus, keybindings, reachability and nls keys against the source.
It only sees string-literal ids. Pre-existing problems are listed in `KNOWN_ISSUES` in
[extension/src/manifest.test.ts](extension/src/manifest.test.ts); remove an entry when fixing it
(stale entries fail the test), never add one for new code.

## Tests

| Pattern                            | Runner                            | Notes                                                                                       |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/**/*.test.ts`                 | ava                               | Unit. Test names are sentences. `packages/wasm` uses `node:test` instead.                   |
| `packages/git/src/**/*.it.test.ts` | `node:test`                       | Runs a real git binary; fixtures in `*.it.stub.ts`.                                         |
| `integration_tests/src/*.test.ts`  | `node:test` + playwright over CDP | One `scm_itest(...)` per suite in [integration_tests/defs.bzl](integration_tests/defs.bzl). |

Integration scenarios in a file **share one editor and one repository and run in file order**,
each building on the previous one's state. Assert git ground truth via the CLI
([integration_tests/src/git.ts](integration_tests/src/git.ts)) inside `pollUntil(...)` — the
extension writes asynchronously.

A failing scenario saves a screenshot to `.bazel/testlogs/integration_tests/<suite>_test/test.outputs/`.
Pass `--test_env=ITEST_SCREENSHOTS=1` to capture every scenario while authoring or debugging.

Pass `--test_env=ITEST_COVERAGE=1` to collect V8 coverage of the extension into
`test.outputs/coverage/`: one `coverage-*.json` per process that ran its code (the extension host,
plus askpass if prompted), in the `NODE_V8_COVERAGE` format, of the shipped bundle; `summary.txt`
(byte coverage and never-called functions of the bundle); and `sources/`, the same mapped back to
the original sources (`index.html`, `lcov.info`, `coverage-final.json`, `summary.txt`). The mapping
uses the hidden source maps `rollup_bundle` writes to `bundle_/sourcemaps/`, which embed the sources
and never reach the VSIX.

`openWorkbench` returns only once the repository's first status refresh has landed, so scenarios
never absorb activation time. Every harness wait (`pollUntil`, Playwright's default timeout, each
scenario) is also capped to a suite deadline derived from Bazel's `TEST_TIMEOUT`, so a stuck wait
fails with its own message and screenshot instead of Bazel killing the suite silently. Wait via the
harness rather than with ad-hoc timers.

When migrating a git invocation from `extension` into `packages/git`, add the integration test
**first** as a behaviour baseline, then move the code and prove the untouched test still passes.

## Pitfalls

- `python3` is not installed. Script with `node`.
- Dependency version bumps are initiated by Renovate; the `.github/workflows/update_*.mjs`
  scripts only complete the derived half (Bazel pins, digests). Don't hand-edit pinned versions.
- `code-server` lags VSCode, so `engines.vscode` and the exact `@types/vscode` pin are derived
  from it and guarded by `//integration_tests:code_server_pin_drift_test`. The exact
  `@vscode/diff` pin (an experimental prerelease series) follows the version that VSCode build
  depends on; Renovate leaves it alone.
- `.shellcheckrc` sets `shell=sh`; add `# shellcheck shell=bash` to bash scripts.
- Telemetry is a no-op `Proxy`, deliberately stubbed rather than removed.

## Working style

Land work as reviewable units: complete one logical change, verify with `bazel test //...` and
`dprint fmt`, then stop for review before starting the next.
