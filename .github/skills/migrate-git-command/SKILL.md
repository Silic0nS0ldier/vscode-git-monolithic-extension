---
name: migrate-git-command
description: 'Migrate a raw git CLI invocation out of the VSCode extension into the `monolithic-git-interop` package (`packages/git/src/api/*`). Use when moving `this.exec([...])` / `this.stream([...])` calls from `extension/src/git.ts` or `extension/src/git/git-class/*` into the git wrapper, when adding a new `packages/git` API module, when asked to "migrate <git command> to packages/git", or to take the next item off the migration backlog. Covers the baseline-integration-test-first workflow, the `Result` module shape, ava + `.it.test.ts` test pairing, call-site rewiring, and the verification loop.'
argument-hint: 'the git command to migrate, e.g. "cat-file -s" or "stash push" (omit to take the next backlog item)'
---

# Migrating a git command into `packages/git`

Moves one git invocation at a time out of the extension and into `monolithic-git-interop`,
proving behaviour is unchanged rather than assuming it. One command = one commit = one PR.

Read [AGENTS.md](../../../AGENTS.md) and
[packages/git/CODE_STYLE.md](../../../packages/git/CODE_STYLE.md) first if not already loaded.
[references/backlog.md](./references/backlog.md) holds the remaining phased command list.

## When to use

- "Migrate `<git command>` to `packages/git`" / "move this out of `git.ts`".
- Adding any new module under `packages/git/src/api/`.
- Reviewing a migration PR for missed steps.

Do **not** use for changing behaviour of an already-migrated command, or for stdin-driven
commands (`commit --file -`, `hash-object --stdin`, `check-ignore --stdin`) — those are
deferred pending API design.

## Procedure

### 1. Locate the invocation and its real UI entry point

If no command was named, re-derive the backlog (search for the raw calls below), then take the
first remaining entry in [backlog.md](./references/backlog.md).

Search `extension/src/` for the raw call (`this.exec([`, `this.stream([`). Note the exact
argv, the env, the error codes mapped from stdout/stderr, and the output-channel logging.

Then find how a user reaches it. **Do not assume there is a palette command** — check the
`when` clause in [extension/vsix/package.json](../../../extension/vsix/package.json). Some
methods are only reached passively through
`extension/src/repository/repository-class/update-model-state/`, and a command with
`"when": "false"` is hidden and not user-invocable.

If no UI path can be driven headlessly, say so and agree an exception before continuing
(example: `rev-parse --show-cdup` only runs when workspace trust is off, which needed an
`UNTRUSTED_SUITES` entry — a code-server started without `--disable-workspace-trust`).

Check whether a suite already drives that entry point: search `integration_tests/src/` for
its UI label. A scenario that only opens a picker or declines a prompt does not run the
command. An existing suite is a baseline to keep green, not a reason to skip writing one —
add a dedicated suite for the paths it misses (the `commit` suite already ran `reset --soft`
once; the `reset` suite added merge commits and unstaged and untracked changes).

### 2. Write the extension integration test FIRST

This is the behaviour baseline. It must pass **before** any production code changes.

1. `integration_tests/fixtures/<family>.sh` — shapes the repository. Start with
   `#!/usr/bin/env bash`, `# shellcheck shell=bash`, `set -euo pipefail`; the first
   positional argument is the git binary and the second the workspace. Model
   [fixtures/refs.sh](../../../integration_tests/fixtures/refs.sh). Use a local bare repo as
   the "remote"; nothing may touch the network. **Make it executable** (`chmod 755`).
2. `integration_tests/src/<family>.test.ts` — `before` opens the workbench, `createScenario`
   runs the ordered scenarios. Scenarios in a file share one editor and one repository.
3. No BUILD edit: [integration_tests/BUILD.bazel](../../../integration_tests/BUILD.bazel)
   globs `src/*.test.ts` and declares the library, the fixture task and the
   `<family>_test` suite for each one. A Restricted Mode suite additionally goes in
   `UNTRUSTED_SUITES`.
4. Assert git ground truth through [src/git.ts](../../../integration_tests/src/git.ts) inside
   `pollUntil(...)` — the extension writes asynchronously.

Prefer landing the baseline suite as its own commit when it is non-trivial.

### 3. Write the package tests before the implementation

Two files, both picked up automatically by the BUILD globs:

| File                | Runner      | Covers                                                            |
| ------------------- | ----------- | ----------------------------------------------------------------- |
| `<name>.test.ts`    | ava         | argv construction and parsing, against a stubbed `GitContext.cli` |
| `<name>.it.test.ts` | `node:test` | real git behaviour, including failure paths                       |

- Unit stub shape: see [for-each-ref/list.test.ts](../../../packages/git/src/api/for-each-ref/list.test.ts).
  The stub **must** pipe into and end `context.stdout` on _every_ path including errors, or
  `readToBuffer`'s stream read never resolves and the test hangs.
- Integration helpers come from
  [api/helpers.it.stub.ts](../../../packages/git/src/api/helpers.it.stub.ts): `gitCtx`,
  `await using repo = await tempGitRepo(true)`, `run(cwd, args, env?)`, `read(cwd, args)`.
  `true` adds an initial commit; use `tempGitRepo()` to test an unborn branch or a root
  commit. Name tests `<fn>.name + " - does the thing"`.
- If the module needs to dispatch on error _type_ (not just `isErr`), write that test first —
  a stub-only suite hides type-erasure bugs.

### 4. Implement the module

Place it at `packages/git/src/api/<command>/<verb>.ts` mirroring the git command name
(`for-each-ref/list.ts`, `stash/list.ts`, `rev-parse/head.ts`). Use `mod.ts` when the command
has a single operation.

Rules ([CODE_STYLE.md](../../../packages/git/CODE_STYLE.md)):

- **Never throw.** Return `Result<T, CLIErrors>` from
  [func-result.ts](../../../packages/git/src/func-result.ts); propagate errors with
  `if (isErr(result)) return result;`.
- Typed error nesting stays ≤1 level deep.
- A doc comment names the wrapped git command verbatim
  (`Wraps \`git for-each-ref --format=<fmt> [patterns]\``).
- **Move the parser into the package**, not the extension — matches `log`, `status`,
  `for-each-ref`, `stash`.
- Reuse `helpers/sanitize-path.ts`, `helpers/split-in-chunks.ts`, `helpers/detach.ts`.
- Parse numbers with `from_str_radix` from `monolithic-git-wasm`, never `Number()`/`parseInt`.
- Bound output: pass an explicit `MAX_BUFFER` to `readToBuffer` with a comment justifying it.
- **`detach()` every field extracted by regex from a large buffer** — V8 `SlicedString`s pin
  the entire buffer otherwise. This is a real leak, not a theoretical one.
- Preserve behaviour exactly: argv, error codes and logging stay identical. If the original
  has a bug, reproduce it, leave a `// TODO` naming the discrepancy and the fix, and pin it
  with an `.it.test.ts` case (`reset` keeps its missing `--`).
- A variant no UI path reaches is kept if the `Repository` interface exposes it (cover it with
  package tests only, like `reset --hard`) and deleted if nothing calls it (like the
  path-less `diff` family).

Add the subpath to `exports` in
[packages/git/package.json](../../../packages/git/package.json) only if the generic
`"./api/*"` pattern does not already cover it. BUILD files need no edit — `srcs` are globbed.

### 5. Rewire the call site and delete the dead code

- Import via the subpath export with **no** file extension:
  `import { list as listRefs } from "monolithic-git-interop/api/for-each-ref/list";`
- The extension is the error boundary: `unwrapOk(...)` to throw, or `isErr`/`unwrap` to map
  onto `GitErrorCodes` in `extension/src/git/error.ts`.
- For a command with no output, follow `add`, `rm` and `reset` in `git.ts`: pass
  `env: cliEnv(this.git.env, "<command>")` and end with `throwOnCliError(result, "<command>")`.
  This keeps the environment and the `GitError` that callers see the same as before.
- Delete the now-unreachable branch in `extension/src/git.ts` and any parser file it used.
  Leaving them behind fails `knip`.
- If a call site outside `git.ts` used `repository.exec` directly, give it a named
  `Repository` method instead of leaking the package call.

### 6. Prove it

Both suites must now pass **unedited**. Editing the baseline test to make it pass defeats the
entire exercise — if it fails, the migration changed behaviour.

```sh
bazel test //packages/git:tests //packages/git:integration_tests //extension:tests
bazel test //integration_tests:<family>_test --local_test_jobs=1 --nocache_test_results
bazel test //...
knip
dprint fmt
```

`--local_test_jobs=1` is required: parallel browser suites starve browserless.
`--nocache_test_results` rules out a stale-cache pass. Confirm every scenario actually ran:
`grep ✔ .bazel/testlogs/integration_tests/<family>_test/test.log`.

### 7. Update the backlog and stop for review

Move the command to the _Done_ table in [backlog.md](./references/backlog.md), naming its
baseline suite, and drop any entry that re-deriving showed to be stale. This goes in the same
commit.

One command per commit. Do not batch. Summarise: the git command, the new module, the call
sites rewired, the code deleted, and the baseline suite that passed untouched.

## Traps

- A fixture without the executable bit fails the whole suite before any scenario runs, with
  only `panic: exit status 126` from `svcinit` at the end of `test.log`.
- Skill arguments are substituted into this file, so a literal dollar-digit placeholder in
  prose is replaced by an empty string. Write "the first argument" instead.
- A same-named existing package function may not have matching semantics. `config read()` is
  scope-forced (`--local`/`--global`); the extension's unscoped `git config --get` needed a
  new `readEffective()`. Check constraints before declaring a "pure rewire".
- `git config --get` exits 1 for both "key unset" and "malformed key" — distinguish on
  stderr, not exit code.
- `git stash push` ignores untracked files; fixtures that stash must modify an
  already-tracked file.
- `String.prototype.split(sep, limit)` truncates the result array, it does not limit the
  number of splits. `data.split("\t", 1)` yields one element, never two.
- `runCommand` in [harness.ts](../../../integration_tests/src/harness.ts) asserts exactly one
  palette row matches the label. The builtin git extension contributes identically-titled
  commands — drive ambiguous ones from the status bar instead.
- The dugite git build is compiled with prefix `/`, so subcommands that are not builtins
  (`submodule`, `rebase --interactive`, anything in `libexec/git-core`) only resolve once
  `GIT_EXEC_PATH` is set. `workspace-fixture.sh` exports it; a fixture calling git any other
  way has to as well.
- `autoRepositoryDetection` defaults to scanning the first level of the workspace folder, so
  any nested repository — a submodule included — opens as a second SCM provider and doubles
  every resource row. A fixture that needs one provider commits a `.vscode/settings.json`
  turning both that and `git_monolithic.detectSubmodules` off.
