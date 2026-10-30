---
name: shrink-extension-core
description: 'Shrink the extension "core" — the code every integration test suite gets whatever commands it uses — so per-suite pruning of the bundle pays off. Use when breaking up the monolithic `Repository` class (`extension/src/git.ts`) or the repository object (`AbstractRepository`, built in `repository-class/mod.ts`), extracting a repository operation into `extension/src/repository/operations/`, making a command prunable, replacing the exhaustive `Operation` switches with per-operation descriptors, making config options tree-shakeable, measuring the core bundle, or taking the next item off the core-shrinking backlog.'
argument-hint: 'the repository member or backlog item, e.g. "popStash" or "F2" (omit to take the next backlog item)'
---

# Shrinking the extension core

Integration test suites are meant to each get a bundle holding only the commands they use, so that a change reruns
only the suites whose bundle bytes it changed. That only pays off for code reachable _solely_ through commands.
Everything reachable from activation without any command — the **core** — is in every suite's bundle, so changing it
reruns every suite. This skill moves code out of the core, one refactor at a time, without changing behaviour.

Read [AGENTS.md](../../../AGENTS.md) first if not already loaded. Baseline suites are written as in
[migrate-git-command](../migrate-git-command/SKILL.md) step 2. [references/backlog.md](./references/backlog.md) holds
the items and their status.

## What decides whether code is core

Rollup prunes by reachability, statement by statement. Measured on this codebase, a bundle that does not register a
command is byte-identical whatever happens to:

- the command's own modules, and helpers only it uses (including exports of shared modules such as
  `commands/helpers.ts`);
- strings only it uses (`i18n/l10n.ts` exports one function per string);
- unused properties of object literals that never escape (`GitErrorCodes`).

It cannot prune:

- **members of an object that escapes** — the repository object returned by `createRepository` is handed to every
  command and core feature, so every member ships;
- **class methods** — every method of the git-layer `Repository` in `git.ts` ships;
- **top-level calls it cannot prove pure** — each `createConfigOption(...)` in `util/config.ts`;
- **anything core enumerates at runtime** — the exhaustive `switch`es over `Operation` in `repository/Operations.ts`
  name every operation, so adding one edits core.

Types are free: `import type`, type aliases and union types never reach the bundle. Only runtime references count.

So an operation is prunable when it is a free function in its own module, imported only by the commands that use it.

## When to use

- "Extract `<member>` from the repository" / "break up `Repository`" / "make `<command>` prunable".
- Any item in [backlog.md](./references/backlog.md), including the foundation items F1–F4.
- Reviewing such a change for missed steps.

Do **not** use to change behaviour, or to migrate a raw `this.exec`/`this.stream` call into `packages/git` — that is
[migrate-git-command](../migrate-git-command/SKILL.md). A member that core itself calls is not a candidate; the
backlog lists those under _Stays core_.

## Measuring

[scripts/core-bundle.mjs](./scripts/core-bundle.mjs) bundles the extension with no commands registered (or only those
given with `--keep`) and reports what is left, by source path. It first checks it can reproduce Bazel's bundle byte
for byte, so its numbers are the real ones.

```sh
bazel build --remote_download_outputs=all //extension:lib //extension:bundle //build_defs/rollup_bundle:bin
node .github/skills/shrink-extension-core/scripts/core-bundle.mjs \
    --absent extension/src/repository/operations/move.ts \
    --absent packages/git/src/api/mv/mod.ts
```

`--absent <path>` fails (exit 1) while that module still renders bytes in the core; `--absent-text <text>` fails while
a literal still appears. [scripts/repository-callers.mjs](./scripts/repository-callers.mjs) lists who uses each
repository member and git-layer method, resolved with the type checker (`--files` names the command modules).

## Target shape

The repository layer (`run(Operation.X, ...)` wrappers in `repository-class/mod.ts`, and the helpers in
`repository-class/` they call) and, once migrated, the git layer (the `git.ts` method) move into
`extension/src/repository/operations/<kebab-name>.ts`. The module exports a function named after the member it
replaces, taking the repository first:

```ts
import { mv as gitMv } from "monolithic-git-interop/api/mv/mod";
import { throwOnCliError } from "../../git/cli-error.js";
import { cliEnv } from "../../git/git-class/cli-env.js";
import { Operation } from "../Operations.js";
import type { AbstractRepository } from "../repository-class/AbstractRepository.js";

export function move(repository: AbstractRepository, from: string, to: string): Promise<void> {
    const base = repository.baseRepository;
    return repository.run(Operation.Move, async () => {
        const result = await gitMv(base.git._context, base.root, from, to, { env: cliEnv(base.git.env, "mv") });
        throwOnCliError(result, "mv");
    });
}
```

Commands import it: `await repository.move(from, to)` becomes `await move(repository, from, to)`. Core (anything
outside `repository/operations/` and `commands/implementations/`) never value-imports from `repository/operations/`.

`run`, `scheduleRemote` and `baseRepository` are the core primitives backlog item F1 exposes on `AbstractRepository`;
`throwOnCliError` moves out of `git.ts` with the first git-layer move. Expose any further primitive an operation needs
as a narrow, named member (`fireOriginalResourceChange(uri)`), never an internal emitter or box. After F2, pass the
operation's descriptor instead of `Operation.Move`.

## Procedure

### 1. Pick the item and re-derive it

If no item was named, take the first open one in [backlog.md](./references/backlog.md) (foundation items first). Run
`repository-callers.mjs --files`. Confirm every user of the member is a command module or a helper only commands
use; if core uses it, move it to _Stays core_ with the reason and stop. Note the git-layer methods it reaches and
whether they still run raw git (`this.exec`/`this.stream`, directly or through a private helper).

### 2. Make sure a baseline suite runs it

Each command calling the member needs a suite that actually performs the operation — a scenario that only opens a
picker or declines a prompt does not count. The backlog names the known ones; check them in `integration_tests/src/`.
If none exists, write it first, exactly as in migrate-git-command step 2, and land it as its own commit when
non-trivial.

### 3. Measure before

Rebuild as in _Measuring_ and run `core-bundle.mjs --top 0` with an `--absent` for each module the item should push
out of the core (the `repository-class/` helper, the `packages/git` API module). Expect failures; note the core bundle
size for the backlog.

### 4. Move the repository layer

1. Create the operations module. Copy the member's body from the object literal in `repository-class/mod.ts`,
   replacing closure variables with the F1 primitives. A `repository-class/` helper used only by this operation moves
   with it (`git mv`); one shared by several operations moves to its own module under `repository/operations/`, never
   back into core. A `finalRepository` argument becomes the `repository` parameter.
2. Delete the member from `AbstractRepository` and from the object literal. An unused member still ships — it has to
   go.
3. Rewire every command found in step 1.
4. Preserve behaviour exactly: the operation passed to `run`, the `scheduleRemote` key (it decides which queued
   requests merge), the order of prompts, the errors thrown.

### 5. Move the git layer, if it is migrated

Move a `git.ts` method into the operations module (or a sibling) and delete it from the class only when it no longer
runs raw git **and** the callers script shows no user outside the code being moved. Otherwise leave it, and record
in the backlog that the git layer is pending: a raw method stays in `git.ts`, where migrate-git-command finds it, and
a method core also uses (`getRefs`, `getCommit`) stays core. A method other operations also use (the stash calls in
`maybe-auto-stash.ts`, which pull and sync run) moves to its own module under `repository/operations/` once all of
them have moved.

### 6. Prove it

The baseline suites must pass **unedited**.

```sh
bazel test //extension:tests
bazel test //integration_tests:<suite>_test --local_test_jobs=1 --nocache_test_results
bazel test //...
knip
dprint fmt
bazel build --remote_download_outputs=all //extension:lib //extension:bundle //build_defs/rollup_bundle:bin
node .github/skills/shrink-extension-core/scripts/core-bundle.mjs --top 0 --absent <each moved module>
node .github/skills/shrink-extension-core/scripts/core-bundle.mjs --top 0 --keep <a command using it> --absent <it>
```

The last run must **fail**: kept, the command has to reach the module. If it passes, the command no longer calls the
moved code.

### 7. Update the backlog and stop for review

Move the item to _Done_ with the core bundle size before and after, and correct anything re-deriving showed to be
stale. Same commit. One item per commit; do not batch. Summarise: the members removed, the modules created or moved,
the commands rewired, the baseline suites that passed untouched, and the core bundle delta.

## Traps

- Command factories run at activation, and a pruned bundle never calls those of unselected commands. A factory must
  therefore only build its `{ commandId, method, options }` descriptor; anything else it did would silently vanish.
- Module-level statements in an operations module ship with every bundle that imports it. Keep them to declarations;
  per-repository state belongs on the repository, not in module scope.
- `core-bundle.mjs` reporting that the unmodified build does not match usually means stale outputs: rebuild with
  `--remote_download_outputs=all`. If it persists, the script's copy of the Rollup options in
  `build_defs/rollup_bundle/src/main.ts` has drifted — update its mirror.
- `--absent` takes source paths (`extension/src/....ts`, `packages/git/src/....ts`); a path in neither bundle is
  reported with `?`, not silently passed.
- Core classes reach the repository through `this.#repository` (`statusbar.ts`, `autofetch.ts`); the callers script
  counts those as core users.
- Skill arguments are substituted into this file, so a literal dollar-digit placeholder in prose is replaced by an
  empty string. Write "the first argument" instead.
