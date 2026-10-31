# Core-shrinking backlog

Derived on 2026-10-30 at `61c51f53` with [repository-callers.mjs](../scripts/repository-callers.mjs) and
[core-bundle.mjs](../scripts/core-bundle.mjs). Callers move as code changes, so step 1 of the skill re-derives an
item before it is worked on; an item whose member no longer exists is stale.

## Order

Take the first item not under _Done_:

1. F4: dead members
2. F3: tree-shakeable config options
3. F1 together with O1 (`move`): the first extraction, which sets the pattern
4. F2: operation descriptors
5. O2 to O11, in table order
6. R1 to R11, in table order

An operation item is done when step 6 of the skill passes; a foundation item, when its _Done when_ holds.

## Measurement

| Date       | Commit     | Core bundle (no commands) | Full bundle   | Share |
| ---------- | ---------- | ------------------------- | ------------- | ----- |
| 2026-10-30 | `61c51f53` | 464,717 bytes             | 643,940 bytes | 72.2% |

Largest core modules then: `npm:core-js-pure` 75,603, `npm:ignore` 52,413, `npm:watcher` 43,973, `git.ts` 33,252,
`repository-class/mod.ts` 19,226, `model.ts` 15,165, `repository/Resource.ts` 9,409, `lifecycle/activate.ts` 7,913,
`decorationProvider.ts` 6,557, `i18n/l10n.ts` 6,496, `repository/Operations.ts` 6,068.

## Foundation

**F1: primitives for operations.** Expose `run` and `baseRepository` (the git-layer `Repository`) on
`AbstractRepository`, and move `throwOnCliError` from `git.ts` to `extension/src/git/cli-error.ts` for operations to
import. `run` wraps every operation: it reports it through `operations`, pauses the file watchers, retries lock
contention, and refreshes the model unless the operation is read-only. Do it together with the first extraction, O1
unless another is asked for first, so nothing is exposed without a user. Done when:

- the first extracted operation uses `run` and `baseRepository` from its module under
  `extension/src/repository/operations/`;
- ESLint rejects value imports from `repository/operations/` in core: a block in `eslint.config.mjs` for
  `extension/src/**/*.ts`, ignoring `extension/src/repository/operations/**` and
  `extension/src/commands/implementations/**`, with `@typescript-eslint/no-restricted-imports` matching
  `regex: "(^|/)operations/"`. It needs `caseSensitive: true`, or `../Operations.js` matches too, and
  `allowTypeImports: true`. Check it by adding a value import and a type import of the operation to a core file:
  `bazel test //extension:eslint` must fail on the value import only;
- AGENTS.md's _Conventions_ say new repository operations go in `extension/src/repository/operations/`.

**F2: operation descriptors.** `isReadOnly`, `causesLargeWorkingTreeChanges` and `shouldShowProgress` in
[Operations.ts](../../../../extension/src/repository/Operations.ts) switch over every operation, so each new operation
edits core and the whole `Operation` record ships. Replace them with a descriptor per operation,
`{ kind, readOnly, largeWorkingTreeChanges, showProgress }`, passed to `run` and stored by `OperationsImpl`. An
extracted operation's module owns its descriptor; core keeps those it still runs. The union type of kinds can stay
central, since types never ship. Core's checks of particular kinds keep working on `kind`:

- `retryRun.ts` retries lock contention for Pull, Sync and Fetch;
- `autofetch.ts` reacts to remote operations;
- `statusbar.ts` asks whether Sync, Push or Pull is running;
- `repository-class/mod.ts` invalidates config lookups after `Remote`, refreshes after `Refresh`, and notifies after
  `Push`.

Done when no code lists every operation kind, and `core-bundle.mjs --absent-text '"Move"'` passes: the record of all
kinds is the only place `"Move"` occurs in the core today.

**F3: tree-shakeable config options.** Rollup keeps every top-level `createConfigOption(...)` call in
[config.ts](../../../../extension/src/util/config.ts), because it cannot prove the call pure, so a setting only one
command reads is in every bundle. A `/* @__PURE__ */` annotation does not survive, as the root tsconfig sets
`removeComments`.

1. Give `rollup_bundle` a repeatable `--pure-function` flag, mapped to `treeshake.manualPureFunctions`, and a
   `pure_functions` attribute, with a test beside the others in `build_defs/rollup_bundle/src/`.
2. Set `pure_functions = ["createConfigOption"]` on `//extension:bundle`.
3. Mirror it in `core-bundle.mjs`, in `TREESHAKE`.
4. Note on `createConfigOption` that it must stay free of side effects.

Done when `core-bundle.mjs --absent-text branchValidationRegex` passes and `//extension:bundle` is byte-identical to
before: every option is read somewhere today, so a difference means one is not.

**F4: dead members.** `fetch` and `getCommitTemplate` on `AbstractRepository` have no users. Done when both are gone
from the type and the object literal.

## Operations whose git layer is migrated

Both layers move. Commands are under `commands/implementations/`, and `packages/git` modules under
`packages/git/src/api/`: `mv/mod` is `packages/git/src/api/mv/mod.ts`.

| ID  | Members                                                | Commands                                         | Git layer → `packages/git`                              | Baseline suites                            |
| --- | ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| O1  | `move`                                                 | `rename.ts`                                      | `mv/mod`                                                | `mv`                                       |
| O2  | `rm`                                                   | `stage/helpers.ts`                               | `rm/mod`                                                | `rm`, `stage-merge`                        |
| O3  | `revert`                                               | `undo-commit.ts`, `unstage/*`                    | `reset/paths`, `rm/cached`, `branch/has-any`            | `unstage`, `scm`, `commit`, `reset`        |
| O4  | `reset`, `deleteRef`                                   | `undo-commit.ts`                                 | `reset/mod`, `update-ref/delete`                        | `reset`, `commit`, `unstage`               |
| O5  | `branch`                                               | `branch/helpers.ts`                              | `branch/create`, `checkout/new-branch`                  | `branch`                                   |
| O6  | `getIdentity`, `setIdentity`                           | `commit/identity-prompt.ts`, `commit/helpers.ts` | `config/read`, `config/write`                           | `commit-identity`                          |
| O7  | `getStashes`                                           | `stash/*` (three)                                | `stash/list`                                            | `stash`                                    |
| O8  | `checkout`, `checkoutTracking`, `findTrackingBranches` | `checkout/checkout.ts`, `checkout/quick-pick.ts` | `checkout/mod` [1], `repository/find-tracking-branches` | `checkout` [2]                             |
| O9  | `clean`                                                | `clean/*` (three)                                | `clean/mod`, `submodule/update`, `checkout` [1]         | `checkout`, `submodule`                    |
| O10 | `ignore`                                               | `ignore.ts`                                      | none [3]                                                | none, write one                            |
| O11 | `add`                                                  | `stage/*` (six), `commit/helpers.ts`             | `add/mod` [4]                                           | `add`, `scm`, `decorations`, `stage-merge` |

1. The git-layer `checkout` is called by both O8 and `repository-class/clean.ts` (O9): move it to its own module
   under `repository/operations/`, which both import.
2. The suite only checks out detached. Check that a tracking checkout (`checkoutTracking`, `findTrackingBranches`)
   runs somewhere, or add a scenario.
3. `repository-class/ignore.ts` edits `.gitignore` through a `WorkspaceEdit`, not git.
4. `repository-class/commit.ts` (R1) also calls the git-layer `add`: move its git layer with R1.

## Operations whose git layer still runs raw git

The repository layer and its `repository-class/` helpers move now. The raw `git.ts` methods stay where
migrate-git-command finds them; once one is migrated, its call goes into the operations module and the class method
is deleted. Phases are those of the [migrate-git-command backlog](../../migrate-git-command/references/backlog.md).

| ID  | Members                                                    | Commands                                             | Raw git layer (phase)                 | Baseline suites                                |
| --- | ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| R1  | `commit`                                                   | `commit/helpers.ts`                                  | `commit`, `rebaseContinue` (none) [1] | `scm`, `add`, `decorations`, `commit-identity` |
| R2  | `stage`                                                    | `stage/helpers.ts`                                   | `stage` (none) [2]                    | check; likely none                             |
| R3  | `createStash`, `popStash`, `applyStash`, `dropStash`       | `stash/*`                                            | all four (5) [3]                      | none [4]                                       |
| R4  | `deleteBranch`, `renameBranch`                             | `branch/delete-branch.ts`, `branch/rename-branch.ts` | both (4)                              | none                                           |
| R5  | `tag`, `deleteTag`                                         | `tag/create-tag.ts`, `tag/delete-tag.ts`             | both (4)                              | none                                           |
| R6  | `merge`                                                    | `merge.ts`                                           | `merge` (6)                           | none                                           |
| R7  | `rebase`, `rebaseAbort`                                    | `rebase/*`                                           | both (6)                              | none                                           |
| R8  | `cherryPick`                                               | `cherry-pick.ts`                                     | `cherryPick` (6)                      | none                                           |
| R9  | `removeRemote`                                             | `remote/remove-remote.ts`                            | `removeRemote` (7) [5]                | none                                           |
| R10 | `pull`, `pullFrom`, `pullWithRebase`, `sync`, `syncRebase` | `pull/*`, `sync/helper.ts`                           | `pull`, `push` (7) [6]                | none [7]                                       |
| R11 | `push`, `pushFollowTags`, `pushTags`, `pushTo`             | `push/helpers.ts`, `publish/publish.ts`              | `push` (7) [8]                        | none                                           |

1. Out of migration scope (`commit --file -`). `repository-class/commit.ts` moves; it also calls the migrated `add`.
2. Out of migration scope (`hash-object --stdin`). `repository-class/stage.ts` fires `onDidChangeOriginalResource`:
   expose a narrow primitive for that.
3. `maybe-auto-stash.ts` calls the git-layer `createStash` and `popStash` for R10, so those methods move only once
   R10 has too.
4. The `stash` suite only lists stashes. Write one that pops, applies and drops.
5. `run` invalidates config lookups after a `Remote` operation; F2 keeps that.
6. Moves `check-if-maybe-rebased.ts`, `fetch-and-pull.ts`, `pull*.ts`, `sync.ts` and `sync-internal.ts`, but not
   `sync-label.ts`, `sync-tooltip.ts` or `sync-status.ts`, which core uses. Whichever of R10 and R11 comes first
   exposes `scheduleRemote`, the remote-operation scheduler, on `AbstractRepository`. Keep the `scheduleRemote` keys.
7. The `pull` suite declines the rebased-branch warning, so no pull runs. Extend it.
8. Moves `push.ts` and `push-internal.ts`. Exposes `scheduleRemote` if R10 has not.

## Stays core

Not candidates: core calls them, or they wrap core state every suite already runs.

- `buffer`, `getObjectDetails`, `diffWithHEAD`, `diffIndexWithHEAD`: `fileSystemProvider.ts` serves `gitm:` URIs.
- `checkIgnore`: `decorationProvider.ts`.
- `fetchAll`, `fetchDefault`, `fetchUpstreams`: `autofetch.ts`. `fetchPrune` is a one-line wrapper around the same
  path.
- `getRefs`, `getCommit`: their git layer is core (`update-model-state.ts`, `get-rebase-commit.ts`), and the
  repository layer is a one-line wrapper.
- `refresh`, `getInputTemplate`, `headShortName`, `rebaseCommit`: wrap core state.
- `HEAD`, `remotes`, `root`, `sourceControlUI`, `submodules`, `headLabel`, `syncLabel`, `syncTooltip`, `operations`,
  `autoRefresh`, `whenIdleAndFocused` and the `onDid*` events: repository state, read by `model.ts`, `statusbar.ts`,
  `decorationProvider.ts`, `ProgressManager.ts` and `autofetch.ts`.

These would need the pruning to cover entry points other than commands, such as the file system provider and the URI
handler. Revisit once it exists.

Core by design, but worth watching if they keep changing: the `GitErrorCodes` switch in `commands/create.ts` (one
message per error, several specific to one operation) and the stderr classification in `git/error.ts`.

## Done

| Item | Core bundle before → after | Left for later |
| ---- | -------------------------- | -------------- |
