# Sauron

Fault-tolerant file crawler/watcher built for very large trees. It has no VSCode dependency, and its public API
never throws (it returns `Result` tuples from `monolithic-git-interop/util/result`).

- **One pull-based event stream.** The watcher is an `AsyncIterator`. A slow consumer gets larger, fewer batches
  instead of an unbounded queue.
- **Aggregation with visibility.** Bursts settle into one `changes` event. An `activity` event announces a burst
  as soon as it starts, so users can be told something is happening.
- **Bounded memory.** Busy directories collapse into `subtrees` ("anything below here may have changed").
- **Suspension.** Ref-counted handles that work with `await using`. Directories stay watched while suspended, so
  resuming does not re-crawl.
- **Teardown.** `await using`, an `AbortSignal`, or leaving a `for await` loop.
- **Any root.** A root may be a directory (watched recursively), a file or a symlink (followed or not, see
  `followRootSymlinks`). It need not exist yet, and may be removed, replaced or re-created.
- **Ignoring.** Rules are applied one directory at a time and chain from parent to child, as nested `.gitignore`
  files do. Ignored directories are never watched or descended into.
- **Branded strings.** `AbsolutePath`, `RelativePath` and `FileName` are distinct types at compile time and plain
  strings at runtime.

## Usage

```ts
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import { absolutePath, gitignore, ignoreAll, ignorePaths, watch } from "sauron";

const root = unwrap(absolutePath("/path/to/repo")); // check isErr first for untrusted input
const dotGit = unwrap(absolutePath("/path/to/repo/.git"));

const created = watch({
    roots: [root],
    ignore: ignoreAll(ignorePaths([dotGit]), gitignore()),
    settle: { quiet: 500, maxWait: 5_000 },
    signal: deactivation.signal,
});
if (isErr(created)) {
    throw new Error(`Invalid watcher options: ${JSON.stringify(unwrap(created))}`);
}

await using watcher = unwrap(created);
for await (const event of watcher) {
    switch (event.type) {
        case "crawl":
            status.text = event.done ? "Ready" : `Indexing (${event.directories} directories)`;
            break;
        case "activity":
            status.text = "Changes detected…";
            break;
        case "changes":
            // `paths` are individual entries, `subtrees` are directories where anything may have changed.
            await refresh(event.paths, event.subtrees);
            status.text = "Ready";
            break;
        case "degraded":
            log.warn(`No longer fully watching ${event.scope}`, event.error);
            break;
        case "error":
            log.error(event.error);
            break;
    }
}
```

Suspend during intense IO you initiated. Changes made meanwhile are released as one batch once every handle is
disposed:

```ts
{
    await using _paused = watcher.suspend("git checkout");
    await git.checkout(branch);
} // Settles once the watched tree reflects the checkout.
```

## Events

| `type`                  | Meaning                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `crawl`                 | Initial crawl progress. `done: true` once every reachable directory is watched.                                    |
| `activity`              | A batch has started accumulating. Sent at most once per batch, and dropped if the batch settles before it is read. |
| `changes`               | A settled batch: `paths` plus `subtrees`. They never overlap.                                                      |
| `suspended` / `resumed` | Suspension state changed.                                                                                          |
| `degraded`              | Changes under `scope` are no longer fully observed (e.g. watch limit reached, root missing).                       |
| `error`                 | A non-fatal failure (unreadable directory, throwing ignorer, …).                                                   |

Status events (`crawl`, `activity`, `suspended`/`resumed`) are conflated, so you only see the latest. `degraded`
and `error` are queued (bounded). Iteration ends with a `CloseReason` (`disposed` or `aborted`), which is also
available as `watcher.closed`.

## Ignoring

An `Ignorer` is visited once per directory with that directory's entries and their kinds. It returns the names to
skip, plus optionally a different `Ignorer` for subdirectories. When a name in `triggers` changes (e.g.
`.gitignore`), that directory's subtree is re-evaluated and reported as changed. An optional `relocatable` tells
whether a moved directory would be visited the same at its new place, so it need not be visited again. `gitignore()`
vouches for that unless a pattern could apply differently there (e.g. one anchored at that depth, or `**`), or the
rules come from a `.gitignore` within the moved directory.

```ts
import { type Ignorer } from "sauron";

const ignoreNodeModules: Ignorer = {
    visit: dir => ({ ignored: new Set(dir.entries.keys().filter(name => name === "node_modules")) }),
};
```

Built-ins: `gitignore({ patterns })` (nested `.gitignore` files plus extra root patterns, such as
`.git/info/exclude`), `ignorePaths(paths)`, `ignoreAll(...ignorers)` and `ignoreNothing`.

Changes to an ignored entry are dropped, except that creating or removing one lists its directory again: rules may
depend on the kind of entry (e.g. `cache/` ignores only a directory), which only those can change.

> Git still reports changes to _tracked_ files that match an ignore pattern. `gitignore()` does not see those
> changes.

## Design notes

- **Crawl order.** Each directory is watched before it is listed, so entries created in between are not missed.
  Events for names outside the last listing wait for a rescan of that directory. That way, ignore rules (which may
  depend on whether the entry is a directory) are applied before the change is reported.
- **Rescans.** At most one rescan runs per directory; events that arrive meanwhile coalesce into one more.
  While any rescan is in flight, a batch only settles at `maxWait`, so a burst is not split across batches.
  A `rename` of a watched subdirectory reports its old path as a subtree. A platform watch follows the original
  inode, so the old watches are wrong for whatever is at that path now.
- **Moved directories.** Inotify tells the directory a subdirectory moved from and the one it moved to, but Node
  drops what pairs the two events. So a moved directory's watches are kept aside, and a directory appearing anywhere
  in the tree meanwhile is matched by identity (device and inode) and takes them over, reported as a subtree. Only
  its old and new parents are listed again, and nothing inside it is unless the ignore rules may differ there
  (`Ignorer.relocatable`); even then, the last listings are reused. A directory that never reappears is released once
  rescans settle. Identities are recorded only for directories with watched subdirectories (one `lstat` each, after
  the listing): anything else is as cheap to watch again. A listing (or `lstat`) is applied a macrotask after it
  completes, so a move it raced with is seen first and the stale result dropped. Nothing is reused that may be wrong:
  a directory that was being listed when it moved, or that may have been deleted (it was told of itself twice, which
  a move does once), is watched afresh, so an inode number reused by a new directory cannot lead to a dead watch.
  That includes a directory moved twice before it is found again.
- **Roots.** Each root is anchored by a watch on its nearest existing ancestor (normally its parent). The anchor
  sees the root being created, removed or replaced, and a file root's changes. A removed root is reported as a
  subtree, and the anchor moves up until the root reappears. The anchor watch is in place before the root is
  checked, so nothing created in between is missed. Unrelated activity next to a root costs a string comparison.
  If the anchor directory itself is removed or moved, the root is checked by identity (device and inode) and only
  re-crawled if it changed. Events without a name may hide a replacement, so they re-crawl it.
- **Ancestors.** Moving a directory moves everything below it, but only the directory holding it is told. So every
  directory above the anchor is watched too, up to the file system root, as is the way to where a symlink root
  leads. Any of them seeing the next directory on the way to the root change checks the root by identity. That is
  one watch per level, whatever the size of the tree. One that cannot be watched (e.g. not readable) is skipped.
- **Dangling root symlinks.** While a followed root does not resolve, its symlinks are followed as far as they lead
  (from each one's real directory, as the kernel does, and at most 40, its limit). The nearest existing directory
  on the way to where it would be, and each symlink on the way, are watched like ancestors. So the root is found once
  its target is created (one directory at a time, re-anchoring deeper each time), a symlink on the way is pointed
  elsewhere, or a loop is broken.
- **Failures.** Nothing is retried synchronously, so a failure that recurs at once cannot loop. A watch that fails
  to register or is lost (Node closes a watch that errors), a listing or a `stat` that fails, and an anchor that
  fails are retried after a backoff, through the tree as it is by then. After `retry.attempts` the path is reported
  once as `degraded` and left alone for `retry.cooldown`, unless `rescan()` asks again. Events cannot bypass this:
  while a path backs off, activity does not retry it early. A lost watch reports its directory as a subtree, as
  changes may have been missed. Failures during the initial crawl are retried after it; `crawl` still reports done.
- **Suspension.** Releasing the last handle retries any failures that are backing off, then waits for in-flight
  rescans before resuming, so the next `changes` batch covers everything that happened while suspended.
- **Backends.** `Backend` abstracts the platform. `createNodeBackend()` registers one non-recursive `fs.watch` per
  directory, because Node's `recursive: true` is emulated in userland on Linux. Tests use an in-memory backend.

## Special entries and metadata

[src/watch/special.it.test.ts](src/watch/special.it.test.ts) covers these on a real file system (Linux).

- **Symlinks, FIFOs, sockets and devices** are reported like files when created, removed or changed. They are never
  followed, watched, listed or read, so loops and links out of the tree are harmless. A `.gitignore` that is one of
  them is not read, as git does not read it either. A root may be any of them. A root that is a symlink is followed
  by default, and is treated as missing while it dangles or loops, until its target appears or the loop is broken.
  With `followRootSymlinks: false` the symlink itself
  is watched like a file root: changes to it are reported, and its target is never read.
- **Symlink targets** (the path a symlink holds) are tracked, as git stores them. Linux cannot change one in place,
  so pointing a symlink elsewhere replaces it, which is reported like any replacement: by `rm` and `ln -s`, or
  atomically by renaming a new symlink over it (as `ln -sfn` does), even to the same path. What a symlink leads to
  is never followed: a change there is only reported where it happens, if that is within a root.
- **Type changes** (e.g. a file replaced by a FIFO, or a directory by a symlink) are reported. A directory is
  watched once it appears and no longer once replaced.
- **Metadata** changes are reported: permissions, owner and group, atime and mtime set explicitly, extended
  attributes, and changes to ctime alone (e.g. `chmod` to the same mode), which git compares. Reads are not, so git
  reading files cannot cause a feedback loop. A creation time only changes when the entry is replaced, which is
  reported.
- **Directory metadata.** Node reports a metadata change to a directory as `rename` (inotify sets `IN_ISDIR`), so it
  is handled as a possible replacement and reported as a subtree. Like a move, the directory is then found again by
  identity, so it keeps its watches.
- **Hardlinks** are entries of their own. A write through one is reported for that link only, as inotify reports the
  path written through. Its other links are not reported, whether in or outside the tree. Knowing them would need an
  `lstat` per file, and would still miss links created after the crawl.
- **Reflinks** (clones) are separate files that share blocks until written, so they need nothing special.

## Benchmark

`bazel test //packages/sauron:bench` compares sauron with `watcher` (the package the extension uses today) using
deterministic metrics: fs calls, V8 precise coverage, inotify watches and retained heap. It fails when a result
leaves its expected range, whether better or worse, and when sauron does more work than `watcher`. See
[src/bench/README.md](src/bench/README.md).

## Parity with `watcher`

[src/watch/parity.it.test.ts](src/watch/parity.it.test.ts) runs `watcher`'s own test suite (v2.3.1, names kept
verbatim) against both, on a real file system. sauron must report every path each test expects, cover everything
`watcher` reports, and report nothing more unless the scenario says why. Where it does report more, it is more
correct:

- Entries replaced, even by themselves (renamed away and back): sauron reports them rather than compare identities.
  Git checks them too, as replacing changes ctime.
- Files replaced with identical stats (inode reused, same size and mtime): `watcher` compares stats, so can miss
  them.
- Directories deeper than 20 levels, where `watcher` stops by default.

Tests that do not apply are listed as skipped, with the reason: initial `add` events (sauron's `crawl` event
marks when the initial state is known), the `depth`, `recursive: false` and `native` options, and rename
detection (the extension disables it).

## Not yet implemented

- Native recursive backends (FSEvents, `ReadDirectoryChangesW`) and watchman/fsmonitor.
- A polling fallback for `degraded` subtrees.
- Caching `.gitignore` contents across rescans of the same directory.

## Considered and rejected

### fanotify (Linux)

Investigated in November 2026 (kernel 7.0, Node.js 26.12 via `node:ffi`). fanotify only beats inotify with
`FAN_MARK_MOUNT` or `FAN_MARK_FILESYSTEM`: one mark for a whole file system, so no crawl and no per-directory
watches. Both need `CAP_SYS_ADMIN`. Without it (Linux 5.13+), fanotify allows only inode marks, so it still needs
one mark per directory, like inotify. Without a recursive watch it has little to offer.

It does work unprivileged with `FAN_REPORT_DFID_NAME`. Events identify the parent directory by file handle, so
each watched directory's handle has to be recorded with `name_to_handle_at`. On overlayfs (e.g. devcontainers) that
fails with `EOPNOTSUPP` unless `AT_HANDLE_FID` (Linux 6.5+) is passed.

Prototype, 60,000 watched directories, one file written in each:

| Approach                 | Register | Heap    | RSS    | Records per write |
| ------------------------ | -------- | ------- | ------ | ----------------- |
| `fs.watch` per directory | ~95 ms   | +28 MB  | +76 MB | 1                 |
| inotify via `node:ffi`   | ~68 ms   | ~0      | +7 MB  | 2                 |
| fanotify via `node:ffi`  | ~147 ms  | +1.2 MB | +24 MB | 1                 |

Delivery time was the same for all three. inotify's 2 records per write are `IN_MODIFY` and `IN_CLOSE_WRITE`;
`fs.watch` does not subscribe to the latter. fanotify merges them in the kernel. The memory saving comes from
dropping Node's per-watch `FSWatcher`, so raw inotify gets it too, at lower registration cost.

What fanotify would add:

- A mark budget separate from inotify's, so it would not compete with VSCode's own file watcher.
- `FAN_RENAME` (5.17+) pairs the old and new name in one event.
- In-kernel merging of different event types on the same name.

What it would cost:

- `fs.fanotify.max_user_marks` is per user and shared across processes. Users raise
  `fs.inotify.max_user_watches` for IDEs, but rarely this limit.
- Linux 5.13+, or 6.5+ on overlayfs.

Any syscall backend needs `node:ffi` (Node.js 26.1+) or a native addon. Electron 43 (VSCode 1.144) ships Node.js
24.17, so on desktop it would need a native addon for each architecture.
