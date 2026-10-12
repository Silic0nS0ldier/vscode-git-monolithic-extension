# Benchmark

Compares sauron with [`watcher`](https://github.com/fabiospampinato/watcher), the package the extension uses today,
as configured in `extension/src/watch/`. It runs as an ordinary Bazel test, so it needs to give the same result
on every run, whatever the machine or its load.

```sh
bazel test //packages/sauron:bench        # fails if any result leaves its expected range, better or worse
bazel run //packages/sauron:bench_update  # re-records src/bench/expected.json after an intended change
```

Both print a table of every metric. Commit `expected.json` together with the change that moved the numbers.
That way the diff shows the performance impact. Bumping Node.js or `watcher` also requires an update.

## Metrics

Each is recorded per phase unless noted.

| Metric               | Source                                                           | Determinism      |
| -------------------- | ---------------------------------------------------------------- | ---------------- |
| `fs.<function>`      | Calls to each `node:fs` / `node:fs/promises` export              | Exact            |
| `fs.total`           | Sum of the above                                                 | Exact            |
| `coverage.functions` | V8 precise coverage: function invocations                        | Exact for sauron |
| `coverage.blocks`    | V8 precise coverage: executions of reported nested blocks        | Exact for sauron |
| `inotify.watches`    | Kernel watches held, from `/proc/self/fdinfo` (some phases only) | Exact            |
| `heap.retained`      | V8 heap growth after the crawl, after forced GC (crawl only)     | ±0.1%            |

Coverage counts only the subject: its own code, its dependencies (e.g. `ignore`) and its adapter in `subjects/`.
The harness and Node.js internals are excluded. `fs.*` measures what each subject asks of the file system, which
is where most of a watcher's cost lies. `coverage.*` measures the JavaScript it executes to do so. Neither depends on
CPU speed, JIT state or load, unlike wall-clock time. The crawl times printed under `(info)` are never compared.

## Phases

Each subject × mode runs in its own Node.js process against a freshly generated fixture: 1,556 watched directories
holding ~12,400 files, plus content ignored via `.git`, `node_modules`, `build` and `*.log`.

| Phase         | Change                                                                |
| ------------- | --------------------------------------------------------------------- |
| `crawl`       | Start watching, until the initial crawl is done                       |
| `edit`        | Modify one file                                                       |
| `burst`       | 400 new files, 400 writes to 288 existing files, 200 to ignored paths |
| `add-tree`    | Create 31 directories holding 100 files                               |
| `remove-tree` | Delete a 259-directory subtree                                        |
| `close`       | Dispose of the watcher                                                |

Each phase checks that its change was reported, so a subject cannot win by missing changes.

## What makes it deterministic

- **Mutations are synchronous.** The kernel queues every resulting inotify event before the watcher reads any,
  so the event stream is the same on every run.
- **Measurement starts at quiescence.** A phase ends once no fs call is in flight and nothing (fs call,
  completion or notification) has happened for 250 ms. Sauron's events are consumed only at that point, so
  conflated status events are not consumed one at a time.
- **Fixtures are fixed.** The tree is generated the same way every time, at a fixed-length path under `/tmp`.
  That keeps retained heap independent of the sandbox path.
- **The runtime is pinned.** Node.js comes from Bazel and runs with `--predictable`, which removes V8 background
  threads and fixes the GC schedule. Children run the plain Node.js binary rather than rules_js's wrapper,
  whose `node:fs` patches would otherwise be counted.

This held for 20 concurrent runs alongside 16 CPU-bound processes (load average ~24).

## Tolerances

Set per subject and metric family in `expected.json`. The allowed deviation is
`max(absolute, relative × expected)`. `bench_update` keeps whatever is there.

- **sauron:** `fs` and `inotify` are exact. `coverage` allows 0.1% (minimum 5), covering timer-dependent paths
  under extreme load. `heap` allows 0.5%.
- **watcher:** like sauron, except `coverage` is `null` (recorded, not checked). `watcher` batches by timing,
  so its coverage varies by up to ~15% between runs.

## Comparison

`sauron does no more work than watcher` requires sauron ≤ `watcher` for `fs.total` and `coverage.functions`
in every phase, and for `inotify.watches` and `heap.retained` after the crawl. `coverage.blocks` is not
compared: V8 omits blocks that ran as often as their enclosing range, so the count reflects code shape as much
as work.

## Investigating

`SAURON_BENCH_TOP=<n>` prints the n most executed functions per phase (calls, blocks, location):

```sh
bazel build //packages/sauron:bench_lib
cd .bazel/bin/packages/sauron
SAURON_BENCH_TOP=20 node --predictable --expose-gc dist/bench/child.js sauron counts /tmp/out.json
```

## Known limits

- Linux only (`target_compatible_with`), as inotify behaviour and `watcher`'s strategy differ elsewhere.
- Kernel time is only measured indirectly, through call counts.
- Lock-file gating (`index.lock`, …) in `watcher`'s extension usage is left out, as with sauron it moves to the
  extension.
