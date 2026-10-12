import { isErr, unwrap } from "monolithic-git-interop/util/result";
import {
    absolutePath,
    type CloseReason,
    gitignore,
    ignoreAll,
    ignorePaths,
    watch,
    type WatchEvent,
} from "../../mod.js";
import type { StartSubject } from "./mod.js";

type Pull = Promise<IteratorResult<WatchEvent, CloseReason>>;

export const start: StartSubject = options => {
    const root = absolutePath(options.root);
    const dotGit = absolutePath(options.dotGit);
    if (isErr(root) || isErr(dotGit)) {
        throw new Error("Fixture paths must be absolute");
    }
    const created = watch({
        roots: [unwrap(root)],
        ignore: ignoreAll(ignorePaths([unwrap(dotGit)]), gitignore()),
        settle: { quiet: options.settleMs, maxWait: 5_000 },
    });
    if (isErr(created)) {
        throw new Error(`watch() failed: ${JSON.stringify(unwrap(created))}`);
    }
    const watcher = unwrap(created);

    let reported = new Set<string>();
    let pending: Pull | null = null;

    // At most one pull is outstanding, so conflated status events are not consumed one at a time.
    function pull(): Pull {
        const next = watcher.next();
        pending = next;
        void next.then(result => {
            if (pending === next) {
                pending = null;
            }
            if (!result.done && result.value.type === "changes") {
                for (const changed of result.value.paths.union(result.value.subtrees)) {
                    reported.add(changed);
                }
            }
            options.onNotify();
        });
        return next;
    }

    pull();

    return {
        async drain() {
            while (pending === null) {
                const next = pull();
                const queued = await Promise.race([
                    next.then(() => true),
                    new Promise<false>(resolve => setImmediate(resolve, false)),
                ]);
                if (!queued) {
                    return;
                }
            }
        },
        takeReported() {
            const taken = reported;
            reported = new Set();
            return taken;
        },
        async close() {
            await watcher[Symbol.asyncDispose]();
        },
    };
};
