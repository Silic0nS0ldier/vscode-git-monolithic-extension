# Migration backlog

Derived from [extension/src/git.ts](../../../../extension/src/git.ts) on 2026-10-25. **Re-derive
before trusting it**: every `this.exec(` / `this.stream(` call left in `extension/src/` is a
candidate, and an entry here with no matching call is stale.

Scope is SCM-UI-reachable commands. Work top to bottom; phases are ordered by risk.

## Out of scope

Stdin-driven commands, pending API design review:

- `commit --file -` (`commit`)
- `hash-object --stdin -w` + `update-index --cacheinfo` (`stage`)
- `check-ignore -v -z --stdin` (`repository-class/check-ignore.ts`)

## Done

| Command                                  | Module                              | Baseline suite    |
| ---------------------------------------- | ----------------------------------- | ----------------- |
| `for-each-ref` (list, single branch)     | `for-each-ref/list.ts`, `branch.ts` | `refs`            |
| `show -s --format`                       | `show.ts`                           | `commit`          |
| `stash list`                             | `stash/list.ts`                     | `stash`           |
| `config --get commit.template`           | `config/read.ts` (`readEffective`)  | `commit-template` |
| `log --oneline --cherry`                 | `log/cherry.ts`                     | `pull`            |
| `rev-parse --show-cdup`                  | `rev-parse/show-cdup.ts`            | `untrusted`       |
| `cat-file -s`                            | `cat-file/size.ts`                  | `object`          |
| `diff [--cached] -- <path>`              | `diff/path.ts`                      | `diff`            |
| `fetch [remote [ref]] [--all] [--prune]` | `fetch/mod.ts`                      | `fetch`           |
| `add -A\|-u -- <paths>`                  | `add/mod.ts`                        | `add`             |
| `rm -- <paths>`                          | `rm/mod.ts`                         | `rm`              |
| `reset --soft\|--hard <treeish>`         | `reset/mod.ts`                      | `reset`           |
| `branch` (any-branch probe)              | `branch/has-any.ts`                 | `unstage`         |
| `reset -q <treeish> -- <paths>`          | `reset/paths.ts`                    | `unstage`         |
| `rm --cached -r -- <paths>`              | `rm/cached.ts`                      | `unstage`         |
| `update-ref -d <ref>`                    | `update-ref/delete.ts`              | `unstage`         |

Older migrations (`init`, `rev-parse --show-toplevel`/`--git-dir`, `symbolic-ref`, `status`,
`ls-files`, `ls-tree`, `clean`, remotes listing, tracking branches) predate the baseline-first
workflow and have no dedicated suite.

The unreachable half of the `diff` family (`diff [--cached]` with no path, `diff <ref>`,
`diff <a>...<b>`, `diff <blob> <blob>`, the `--name-status` parser) was deleted, not migrated.

## Remaining

Each entry is `git.ts` method: command → target module. "Reached by" names the UI entry point
and any existing suite that already drives it — extend or reuse that baseline rather than
duplicating it.

### Phase 3 — index & worktree mutations

- `checkout`: `checkout -q [--track] [--detach] [treeish] [-- <paths>]`, paths chunked; maps
  "Please commit your changes or stash them" → `checkout/mod.ts`.
- `move`: `mv <from> <to>` → `mv/mod.ts`.
- `updateSubmodules`: `submodule update -- <paths>`, chunked → `submodule/update.ts`. Needs
  `GIT_EXEC_PATH` (see the skill's traps).

### Phase 4 — branch & tag mutations

- `branch`: `checkout -q -b <name> --no-track [ref]` / `branch -q <name> [ref]` →
  `branch/create.ts`
- `deleteBranch`: `branch -d|-D <name>` → `branch/delete.ts`
- `renameBranch`: `branch -m <name>` → `branch/rename.ts`
- `tag`: `tag [-a <name> -m <message>|<name>]` → `tag/create.ts`
- `deleteTag`: `tag -d <name>` → `tag/delete.ts`

### Phase 5 — stash mutations

Error codes to preserve: `NoLocalChanges`, `NoStashFound`, `LocalChangesOverwritten`,
`StashConflict` (the last is matched on **stdout**). The `stash` suite only lists stashes; it
does not pop one.

- `createStash`: `stash push [-u] [-m <message>]` → `stash/push.ts`
- `popStash` / `applyStash`: `stash pop|apply [stash@{n}]` → `stash/restore.ts`
- `dropStash`: `stash drop [stash@{n}]` → `stash/drop.ts`

### Phase 6 — merge & rebase

- `merge`: `merge <ref>` → `merge/mod.ts`. Conflict is detected from **stdout**, not stderr,
  so this needs typed `CLIErrors` dispatch through `readToBuffer`.
- `rebase`: `rebase <branch>` → `rebase/mod.ts`
- `rebaseAbort` / `rebaseContinue`: `rebase --abort|--continue` → `rebase/abort.ts`,
  `rebase/continue.ts`
- `cherryPick`: `cherry-pick <hash>` → `cherry-pick/mod.ts`

### Phase 7 — network

Fixtures create a local bare remote; no external network. The `pull` suite drives _Pull_ and
_Sync_ but declines the rebased-branch warning, so neither the pull nor the push runs.

- `pull`: `pull [--tags] [--unshallow] [-r] [remote branch]` with `GIT_HTTP_USER_AGENT` →
  `pull/mod.ts`
- `push`: `push [--force-with-lease|--force] [-u] [--follow-tags] [--tags] [remote [name]]`
  with `GIT_HTTP_USER_AGENT` → `push/mod.ts`
- `removeRemote`: `remote remove <name>` → `repository/remotes/remove.ts`
- `clone`: `clone <url> <folder> --progress [--recursive]` → `clone/mod.ts`. Progress rides
  the `CLIContext.stderr` writable; keep the `\r`-split line parser and `GIT_HTTP_USER_AGENT`.
