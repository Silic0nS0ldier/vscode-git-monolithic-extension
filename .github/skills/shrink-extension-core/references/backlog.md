# Core-shrinking backlog

Derived on 2026-10-30 at `61c51f53` from [repository-callers.mjs](../scripts/repository-callers.mjs) and
[core-bundle.mjs](../scripts/core-bundle.mjs). **Re-derive before trusting it**: callers move as commands change, and
an item whose member no longer exists is stale.

Work top to bottom: foundation first, then operations whose git layer is migrated (both layers move), then those
whose git layer still runs raw git (the repository layer moves now; the git layer follows its migration in
[migrate-git-command](../../migrate-git-command/references/backlog.md)).

## Measurement

| Date       | Commit     | Core bundle (no commands) | Full bundle   | Share |
| ---------- | ---------- | ------------------------- | ------------- | ----- |
| 2026-10-30 | `61c51f53` | 464,717 bytes             | 643,940 bytes | 72.2% |

Largest core modules then: `npm:core-js-pure` 75,603, `npm:ignore` 52,413, `npm:watcher` 43,973, `git.ts` 33,252,
`repository-class/mod.ts` 19,226, `model.ts` 15,165, `repository/Resource.ts` 9,409, `lifecycle/activate.ts` 7,913,
`decorationProvider.ts` 6,557, `i18n/l10n.ts` 6,496 (30.7% of its full size), `repository/Operations.ts` 6,068.

## Foundation

**F1 — Core primitives for operations.** Expose what extracted operations need on `AbstractRepository`: `run` (the
operation queue), `scheduleRemote` (the remote-operation scheduler) and `baseRepository` (the git-layer `Repository`
from `git.ts`), and create `extension/src/repository/operations/`. Do it as part of the first extraction rather than
on its own, so nothing is exposed without a user.

**F2 — Operation descriptors.** `isReadOnly`, `causesLargeWorkingTreeChanges` and `shouldShowProgress` in
[Operations.ts](../../../../extension/src/repository/Operations.ts) are exhaustive switches over every operation, so
each new operation edits core, and the whole `Operation` record ships. Replace them with a descriptor carrying those
flags (`{ kind, readOnly, largeWorkingTreeChanges, showProgress }`), passed to `run` and stored by `OperationsImpl`.
Each operation module then owns its descriptor, and core keeps only those it runs itself (`Refresh`, `Fetch`,
`CheckIgnore`, `GetObjectDetails`, `Diff`). The union type of kinds can stay central: types are free. Core checks of
particular kinds keep working on `kind`:

- `retryRun.ts` retries lock contention for Pull, Sync and Fetch;
- `autofetch.ts` reacts to remote operations;
- `statusbar.ts` asks whether Sync, Push or Pull is running;
- `repository-class/mod.ts` invalidates config lookups after `Remote`, refreshes after `Refresh`, and notifies after
  `Push`.

Done when adding an operation touches no core file and `core-bundle.mjs` shows
`extension/src/repository/Operations.ts` well below its 6,068 bytes.

**F3 — Tree-shakeable config options.** Rollup keeps every top-level `createConfigOption(...)` call in
[config.ts](../../../../extension/src/util/config.ts) because it cannot prove the call pure, so a setting only one
command reads is in every bundle. `/* @__PURE__ */` does not survive: the root tsconfig sets `removeComments`.

1. Give `rollup_bundle` a pure-functions option: a repeatable `--pure-function` flag mapped to
   `treeshake.manualPureFunctions`, and a `pure_functions` attribute.
2. Set it to `createConfigOption` for `//extension:bundle`.
3. Mirror it in `core-bundle.mjs` (`TREESHAKE`).
4. Note on `createConfigOption` that it must stay free of side effects.

Done when `core-bundle.mjs --absent-text branchValidationRegex` passes and the shipped bundle is byte-identical
(every option is read somewhere today; a difference means one is not).

**F4 — Dead members.** `fetch` and `getCommitTemplate` on `AbstractRepository` have no callers. Delete them from the
type and the object literal.

## Operations whose git layer is migrated

Both layers move. Commands are under `commands/implementations/`; `packages/git` modules under `api/`.

| Members                                                | Commands                                         | Git layer → `packages/git`                              | Baseline suites                            |
| ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| `move`                                                 | `rename.ts`                                      | `mv/mod`                                                | `mv`                                       |
| `rm`                                                   | `stage/helpers.ts`                               | `rm/mod`                                                | `rm`, `stage-merge`                        |
| `revert`                                               | `undo-commit.ts`, `unstage/*`                    | `reset/paths`, `rm/cached`, `branch/has-any`            | `unstage`, `scm`, `commit`, `reset`        |
| `reset`, `deleteRef`                                   | `undo-commit.ts`                                 | `reset/mod`, `update-ref/delete`                        | `reset`, `commit`, `unstage`               |
| `branch`                                               | `branch/helpers.ts`                              | `branch/create`, `checkout/new-branch`                  | `branch`                                   |
| `getIdentity`, `setIdentity`                           | `commit/identity-prompt.ts`, `commit/helpers.ts` | `config/read`, `config/write`                           | `commit-identity`                          |
| `getStashes`                                           | `stash/*` (three)                                | `stash/list`                                            | `stash`                                    |
| `checkout`, `checkoutTracking`, `findTrackingBranches` | `checkout/checkout.ts`, `checkout/quick-pick.ts` | `checkout/mod` [1], `repository/find-tracking-branches` | `checkout` [2]                             |
| `clean`                                                | `clean/*` (three)                                | `clean/mod`, `submodule/update`, `checkout` [1]         | `checkout`, `submodule`                    |
| `ignore`                                               | `ignore.ts`                                      | none [3]                                                | none, write one                            |
| `add`                                                  | `stage/*` (six), `commit/helpers.ts`             | `add/mod` [4]                                           | `add`, `scm`, `decorations`, `stage-merge` |

1. The git-layer `checkout` is called by both the checkout operation and `repository-class/clean.ts`: move it to a
   module under `repository/operations/` that both import.
2. The suite checks out detached only. Check that a tracking checkout (`checkoutTracking`, `findTrackingBranches`)
   runs somewhere, else add a scenario.
3. `repository-class/ignore.ts` edits `.gitignore` through a `WorkspaceEdit`, not git.
4. `repository-class/commit.ts` also calls the git-layer `add`: move the repository layer now and the git layer
   together with `commit`.

## Operations whose git layer still runs raw git

Move the repository layer and its `repository-class/` helpers now. Leave the raw `git.ts` methods where
migrate-git-command finds them; when one is migrated, its call goes into the operations module and the class method
is deleted. Phases are those of the migrate-git-command backlog.

| Members                                                    | Commands                                             | Raw git layer (phase)                 | Baseline suites                                |
| ---------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| `commit`                                                   | `commit/helpers.ts`                                  | `commit`, `rebaseContinue` (none) [1] | `scm`, `add`, `decorations`, `commit-identity` |
| `stage`                                                    | `stage/helpers.ts`                                   | `stage` (none) [2]                    | check; likely none                             |
| `createStash`, `popStash`, `applyStash`, `dropStash`       | `stash/*`                                            | all four (5) [3]                      | none [4]                                       |
| `deleteBranch`, `renameBranch`                             | `branch/delete-branch.ts`, `branch/rename-branch.ts` | both (4)                              | none                                           |
| `tag`, `deleteTag`                                         | `tag/create-tag.ts`, `tag/delete-tag.ts`             | both (4)                              | none                                           |
| `merge`                                                    | `merge.ts`                                           | `merge` (6)                           | none                                           |
| `rebase`, `rebaseAbort`                                    | `rebase/*`                                           | both (6)                              | none                                           |
| `cherryPick`                                               | `cherry-pick.ts`                                     | `cherryPick` (6)                      | none                                           |
| `removeRemote`                                             | `remote/remove-remote.ts`                            | `removeRemote` (7) [5]                | none                                           |
| `pull`, `pullFrom`, `pullWithRebase`, `sync`, `syncRebase` | `pull/*`, `sync/helper.ts`                           | `pull`, `push` (7) [6]                | none [7]                                       |
| `push`, `pushFollowTags`, `pushTags`, `pushTo`             | `push/helpers.ts`, `publish/publish.ts`              | `push` (7) [8]                        | none                                           |

1. Out of migration scope (`commit --file -`). `repository-class/commit.ts` moves; it also calls the migrated `add`.
2. Out of migration scope (`hash-object --stdin`). `repository-class/stage.ts` fires `onDidChangeOriginalResource`:
   expose a narrow primitive for it.
3. `maybe-auto-stash.ts` (pull and sync) also calls `createStash` and `popStash`; both operations import one module.
4. The `stash` suite only lists stashes. Write one that pops, applies and drops.
5. `run` invalidates config lookups after a `Remote` operation; keep that through F2.
6. Moves `check-if-maybe-rebased.ts`, `fetch-and-pull.ts`, `pull*.ts`, `sync.ts` and `sync-internal.ts`, but not
   `sync-label.ts`, `sync-tooltip.ts` or `sync-status.ts`, which core uses. Keep the `scheduleRemote` keys.
7. The `pull` suite declines the rebased-branch warning, so no pull runs. Extend it.
8. Moves `push.ts` and `push-internal.ts`.

## Stays core

Not candidates: core calls them, or their implementation is core state every suite already runs.

- `buffer`, `getObjectDetails`, `diffWithHEAD`, `diffIndexWithHEAD`: `fileSystemProvider.ts` serves `gitm:` URIs.
- `checkIgnore`: `decorationProvider.ts`.
- `fetchAll`, `fetchDefault`, `fetchUpstreams`: `autofetch.ts`. `fetchPrune` is a one-line wrapper around the same
  path.
- `getRefs`, `getCommit`: their git layer is core (`update-model-state.ts`, `get-rebase-commit.ts`); the repository
  layer is a one-line wrapper.
- `refresh`, `getInputTemplate`, `headShortName`, `rebaseCommit`: wrap core state.
- `HEAD`, `remotes`, `root`, `sourceControlUI`, `submodules`, `headLabel`, `syncLabel`, `syncTooltip`, `operations`,
  `autoRefresh`, `whenIdleAndFocused` and the `onDid*` events: repository state, read by `model.ts`, `statusbar.ts`,
  `decorationProvider.ts`, `ProgressManager.ts` and `autofetch.ts`.

Reaching these needs more than refactoring: the pruning mechanism would have to stub entry points other than
commands (the file system provider, the URI handler). Revisit once it exists.

Core by design, worth watching if their churn grows: the `GitErrorCodes` switch in `commands/create.ts` (one message
per error, several operation-specific) and the stderr classification in `git/error.ts`.

## Done

| Item | Commit | Core bundle before → after |
| ---- | ------ | -------------------------- |
