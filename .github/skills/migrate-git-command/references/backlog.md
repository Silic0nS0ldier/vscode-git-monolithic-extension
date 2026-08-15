# Remaining migration backlog

Derived from `extension/src/git.ts` as of 2026-08-15. **Re-derive if it looks wrong**: search
`extension/src/` for `this.exec([` / `this.stream([`; each remaining call is a candidate.

Scope is limited to SCM-UI-reachable commands. `blame`, `apply`, `merge-base`, `diffBlobs` and
public `hashObject` are backlog. Stdin-driven commands (`commit --file -`,
`hash-object --stdin` + its `update-index --cacheinfo` pair, `check-ignore --stdin`) are
excluded pending API design review.

## Done

Phase 0 enablers (`scm_itest` macro, typed `NonZeroExitDetails`, the `untrusted` suite mode)
and Phase 1 reads: `for-each-ref` list + branch, `show -s --format`, `stash list`,
`config --get commit.template`, `log --oneline --cherry`, `rev-parse --show-cdup`.

Phase 2 so far: `cat-file -s`, baselined by the `object` suite.

## Phase 2 — object & diff reads

Needs a `diff.test.ts` suite with a fixture producing real diffs.

- the `diff` family in `extension/src/git/git-class/diff.ts` + `git.ts` `diff()`:
  `--name-status -z --diff-filter=ADMR`, and `diff [--cached] [ref] -- <path>`
  (`diffWithHEAD`, `diffWith`, `diffIndexWithHEAD`, `diffIndexWith`, `diffBetween`)
  → `api/diff/*.ts`. Move the name-status parser and `Change`/`Status` mapping into the
  package.

## Phase 3 — index & worktree mutations

- `add [-A|-u] -- <paths>` (chunked) → `api/add/mod.ts`
- `rm -- <paths>` → `api/rm/mod.ts`
- `reset --hard|--soft <treeish>` → `api/reset/mod.ts`
- revert: `branch` probe + `reset -q <treeish> -- <paths>` / `rm --cached -r`
  → `api/reset/paths.ts`, `api/rm/cached.ts`
- `checkout -q [--track][--detach] [treeish] [-- paths]`, `checkout -- .`
  → `api/checkout/mod.ts`
- `mv <from> <to>` → `api/mv/mod.ts`
- `update-ref -d <ref>` → `api/update-ref/delete.ts`
- `submodule update -- <paths>` (chunked) → `api/submodule/update.ts`

## Phase 4 — branch & tag mutations

- `checkout -q -b <n> --no-track` / `branch -q <n>` → `api/branch/create.ts`
- `branch -d|-D` → `api/branch/delete.ts`
- `branch -m` → `api/branch/rename.ts`
- `branch --set-upstream-to` → `api/branch/set-upstream.ts`
- `tag [-a -m]` / `tag -d` → `api/tag/create.ts`, `api/tag/delete.ts`

## Phase 5 — stash mutations

Error codes to preserve: `NoLocalChanges`, `NoStashFound`, `LocalChangesOverwritten`,
`StashConflict`.

- `stash push [-u] [-m]` → `api/stash/push.ts`
- `stash pop|apply [stash@{n}]` → `api/stash/restore.ts`
- `stash drop [stash@{n}]` → `api/stash/drop.ts`

## Phase 6 — merge & rebase

- `merge <ref>` → `api/merge/mod.ts`. Conflict is detected from **stdout**, not stderr, so
  this needs typed `CLIErrors` dispatch through `readToBuffer`.
- `rebase <branch>` → `api/rebase/mod.ts`
- `rebase --abort` / `--continue` → `api/rebase/abort.ts`, `api/rebase/continue.ts`
- `cherry-pick <hash>` → `api/cherry-pick/mod.ts`

## Phase 7 — network

Fixtures create a local bare remote; no external network.

- `fetch [remote [ref]] [--all] [--prune] [--depth=n]` → `api/fetch/mod.ts`
- `pull [--tags][--unshallow][-r][remote branch]` → `api/pull/mod.ts`
- `push [--force-with-lease|--force][-u][--follow-tags][--tags]` → `api/push/mod.ts`
- `remote add|remove|rename` → `api/repository/remotes/{add,remove,rename}.ts`
- `clone --progress [--recursive]` → `api/clone/mod.ts`. Progress rides the
  `CLIContext.stderr` writable; keep the `\r`-split line parser and the `GIT_HTTP_USER_AGENT`
  env var.
