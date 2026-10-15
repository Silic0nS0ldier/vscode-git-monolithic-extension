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
- **Any root.** A root may be a directory (watched recursively) or a file. It need not exist yet, and may be removed,
  replaced or re-created.
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
`.gitignore`), that directory's subtree is re-evaluated and reported as changed.

```ts
import { type Ignorer } from "sauron";

const ignoreNodeModules: Ignorer = {
    visit: dir => ({ ignored: new Set(dir.entries.keys().filter(name => name === "node_modules")) }),
};
```

Built-ins: `gitignore({ patterns })` (nested `.gitignore` files plus extra root patterns, such as
`.git/info/exclude`), `ignorePaths(paths)`, `ignoreAll(...ignorers)` and `ignoreNothing`.

> Git still reports changes to _tracked_ files that match an ignore pattern. `gitignore()` does not see those
> changes.

## Design notes

- **Crawl order.** Each directory is watched before it is listed, so entries created in between are not missed.
  Events for names outside the last listing wait for a rescan of that directory. That way, ignore rules (which may
  depend on whether the entry is a directory) are applied before the change is reported.
- **Rescans.** At most one rescan runs per directory; events that arrive meanwhile coalesce into one more.
  While any rescan is in flight, a batch only settles at `maxWait`, so a burst is not split across batches.
  A `rename` of a watched subdirectory re-watches it, because a platform watch follows the original inode. Its old
  contents are reported as a subtree.
- **Roots.** Each root is anchored by a watch on its nearest existing ancestor (normally its parent). The anchor
  sees the root being created, removed or replaced, and a file root's changes. A removed root is reported as a
  subtree, and the anchor moves up until the root reappears. The anchor watch is in place before the root is
  checked, so nothing created in between is missed.
- **Suspension.** Releasing the last handle waits for in-flight rescans before resuming, so the next `changes`
  batch covers everything that happened while suspended.
- **Backends.** `Backend` abstracts the platform. `createNodeBackend()` registers one non-recursive `fs.watch` per
  directory, because Node's `recursive: true` is emulated in userland on Linux. Tests use an in-memory backend.

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
- Reporting symlink target changes (symlinks are reported but never followed).
