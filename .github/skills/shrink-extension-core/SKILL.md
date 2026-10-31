---
name: shrink-extension-core
description: 'Move code out of the extension core, the part of the bundle every integration test suite gets whatever commands it uses, so that changing an operation reruns only the suites that use it. Use this skill when breaking up the `Repository` class in `extension/src/git.ts` or the repository object (`AbstractRepository`), moving a repository operation such as `move` or `popStash` out to the commands that use it, making a command prunable, measuring the core bundle, or taking an item off the core-shrinking backlog, even if the request only asks to slim down `git.ts` or `repository-class/mod.ts`. Not for migrating raw git calls into `packages/git` (use migrate-git-command), building the per-suite pruning itself, or shrinking the shipped VSIX.'
---

# Shrinking the extension core

Each integration test suite is to get a bundle with only the commands it uses, so that a change reruns only the
suites whose bundle it changes. That gains nothing for code every bundle contains: the **core**, everything reachable
from activation without running a command. This skill moves code out of the core one backlog item at a time, without
changing behaviour.

## What keeps code in the core

Rollup leaves a module out of a bundle when nothing reachable uses it, but it cannot leave out:

- **members of the repository object**, which `createRepository` (`repository/repository-class/mod.ts`) hands to
  every command and core feature: each member ships, used or not, with everything it calls;
- **methods of the git-layer `Repository` class** in `git.ts`;
- **code that lists every operation or setting**: the `switch`es in `repository/Operations.ts` (until F2) and the
  top-level `createConfigOption(...)` calls in `util/config.ts` (until F3).

So an operation leaves the core by becoming a function in its own module under `extension/src/repository/operations/`,
imported only by commands and other operations, and by deleting its member: a member left behind to delegate keeps
everything it calls in the core.

## Rules

- Change no behaviour. Keep the operation kind passed to `run`, since core reacts to some kinds (`Remote` invalidates
  config lookups, `Push` notifies, `retryRun` retries Pull, Sync and Fetch). Keep the `scheduleRemote` key, which
  decides what queued requests merge. Keep the prompts, their order, and the errors thrown.
- Baseline suites pass unedited. If one fails, the change altered behaviour: fix the change, not the suite.
- Core, meaning anything outside `repository/operations/` and `commands/implementations/`, never imports a value
  from `repository/operations/`; that would put the operation back in the core. Type imports are fine.
- One backlog item per commit, then stop for review.
- Run every command from the repository root.

## Workflow

Track progress with this checklist:

- [ ] Step 1: Pick the item and confirm its users
- [ ] Step 2: Confirm a baseline suite performs it
- [ ] Step 3: Record the core bundle size
- [ ] Step 4: Move the repository layer
- [ ] Step 5: Move the git layer, if migrated
- [ ] Step 6: Validate until everything passes
- [ ] Step 7: Update the backlog, commit, and report

A foundation item (F1–F4) says in the backlog what it involves and when it is done; do steps 3, 6 and 7 around it.

### 1. Pick the item and confirm its users

Read [references/backlog.md](references/backlog.md). Take the item asked for, or else the first one in its _Order_
that is not done. If it is an extraction and F1 is not done, F1 is part of it. For each member the item names, run:

```sh
node .github/skills/shrink-extension-core/scripts/repository-callers.mjs --member <member> --files
```

The member's core users must be `-`: every user must be under `commands/implementations/` or `repository/operations/`.
If core uses it, move it to _Stays core_ in the backlog with the reason, and stop. Note which git-layer methods it
calls, and whether they still run raw git (`this.exec` or `this.stream`, directly or through a private helper).

### 2. Confirm a baseline suite performs it

Each command using the member needs an integration suite that performs the operation; opening a picker or declining
a prompt does not count. Check the suites the backlog names, in `integration_tests/src/`. If none performs it, write
one first, following step 2 of [migrate-git-command](../migrate-git-command/SKILL.md), and commit it on its own.

### 3. Record the core bundle size

```sh
node .github/skills/shrink-extension-core/scripts/core-bundle.mjs --top 0
```

Note the core bundle size. If the git layer is migrated, also note each `packages/git` module it imports that nothing
else does, for step 6; the backlog's `mv/mod` is `packages/git/src/api/mv/mod.ts`, and
`grep -rn 'monolithic-git-interop/api/mv/mod"' extension/src` shows its importers.

### 4. Move the repository layer

1. Create `extension/src/repository/operations/<member-in-kebab-case>.ts`, exporting a function named after the
   member that takes the repository first (see _Example_). Move the member's body there from the object literal in
   `repository-class/mod.ts`, replacing closure variables with the primitives F1 adds to the repository.
2. Move a `repository-class/` helper used only by this operation into the new module. Put one shared with other
   operations in its own module under `repository/operations/`, not back in core.
3. Delete the member from `AbstractRepository` and from the object literal.
4. Rewire the commands from step 1: `repository.move(from, to)` becomes `move(repository, from, to)`.

### 5. Move the git layer, if migrated

If the `git.ts` method no longer runs raw git and nothing outside the moved code calls it, move it into the
operations module and delete it from the class. Otherwise leave it, and record in the backlog that the git layer is
pending: a raw method waits for [migrate-git-command](../migrate-git-command/SKILL.md), and a method core also calls
stays core.

### 6. Validate until everything passes

Run these, fix what fails, and rerun until all pass:

```sh
bazel test //extension:tests
bazel test //integration_tests:<suite>_test --local_test_jobs=1 --nocache_test_results
bazel test //... --local_test_jobs=1
knip
dprint fmt
```

`--local_test_jobs=1` runs one browser suite at a time: several at once starve each other, and exhaust the memory of
an 8 GB machine. `--nocache_test_results` rules out a stale pass.

Then check the core. For an operation, nothing under `repository/operations/` may be core, nor may any `packages/git`
module noted in step 3:

```sh
node .github/skills/shrink-extension-core/scripts/core-bundle.mjs --top 0 \
    --absent extension/src/repository/operations/ --absent <packages/git module>
```

A command using the operation must still reach it, so this must **fail**, with exit code 1. `<command>` is the id
the command's module passes to `makeCommandId`.

```sh
node .github/skills/shrink-extension-core/scripts/core-bundle.mjs --top 0 --keep <command> \
    --absent extension/src/repository/operations/<module>.ts
```

For a foundation item, run the checks its _Done when_ names instead.

### 7. Update the backlog, commit, and report

In the backlog, delete the item's paragraph or table row, first moving any note a later item needs to that item, and
add the item to _Done_ with the core bundle size before and after and anything left for later. Correct anything step
1 showed to be stale. Commit it all as one commit, then report:

```markdown
**<item>**: moved <members> to <modules>.

- Commands rewired: <files>
- Git layer: moved | pending, because <reason>
- Baseline suites, passed unedited: <suites>
- Core bundle: <before> → <after> bytes
```

## Example

`move`, the first extraction, as F1 leaves it: F1 adds `run` and `baseRepository` to the repository, and moves
`throwOnCliError` out of `git.ts`. Its git layer was already migrated, so it moved too.

```ts
// extension/src/repository/operations/move.ts
import { mv as gitMv } from "monolithic-git-interop/api/mv/mod";
import { throwOnCliError } from "../../git/cli-error.js";
import { cliEnv } from "../../git/git-class/cli-env.js";
import { Operation } from "../Operations.js";
import type { AbstractRepository } from "../repository-class/AbstractRepository.js";

export function move(repository: AbstractRepository, from: string, to: string): Promise<void> {
    const { git, root } = repository.baseRepository;
    return repository.run(Operation.Move, async () => {
        const result = await gitMv(git._context, root, from, to, { env: cliEnv(git.env, "mv") });
        throwOnCliError(result, "mv");
    });
}
```

## Scripts

Both print usage with `--help` and structured output with `--json`. Exit code 2 means a usage or setup error; the
message says what to do.

- `scripts/repository-callers.mjs`: who uses each repository member and git-layer method, from the type checker.
- `scripts/core-bundle.mjs`: builds, then reports what is left of the bundle with no commands, or only those given
  with `--keep`. `--absent` and `--absent-text` checks exit 1 while code is still there.

## Gotchas

- Command factories run at activation, and a pruned bundle skips those of commands it leaves out. A factory must
  only build its `{ commandId, method, options }` descriptor; anything more would silently go missing.
- Module-level statements in an operations module run wherever it is imported. Keep them to declarations, and keep
  per-repository state on the repository.
- Core classes reach the repository through `this.#repository` (`statusbar.ts`, `autofetch.ts`); the callers script
  counts those uses as core.
- A git-layer method also called from another operation's helper moves only once all its callers have:
  `maybe-auto-stash.ts` calls the stash methods for pull and sync.
