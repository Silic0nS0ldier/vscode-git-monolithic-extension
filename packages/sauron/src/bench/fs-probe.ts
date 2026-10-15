import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

/** Calls that register listeners rather than complete asynchronously. */
const LISTENERS = new Set(["watch", "watchFile", "unwatchFile"]);
const COPIED_PROPERTIES_EXCLUDED = new Set<string | symbol>(["length", "name", "prototype", "arguments", "caller"]);

export type FsProbe = {
    /** Whether calls are counted. In-flight tracking is always on. */
    counting: boolean;
    readonly inflight: number;
    /** `performance.now()` of the last call, completion or {@link touch}. */
    readonly lastActivity: number;
    touch(): void;
    /** Returns counts per function (e.g. `promises.readdir`) and resets them. */
    take(): Map<string, number>;
};

/**
 * Wraps every function exported by `node:fs` and `node:fs/promises`.
 * Must run before the measured code is imported, as modules may capture function references at load.
 */
export function installFsProbe(): FsProbe {
    const counts = new Map<string, number>();
    let inflight = 0;
    let lastActivity = performance.now();

    const probe: FsProbe = {
        counting: false,
        get inflight() {
            return inflight;
        },
        get lastActivity() {
            return lastActivity;
        },
        touch() {
            lastActivity = performance.now();
        },
        take() {
            const taken = new Map(counts);
            counts.clear();
            return taken;
        },
    };

    function done(): void {
        inflight--;
        lastActivity = performance.now();
    }

    function wrapAll(target: Record<string, unknown>, prefix: string): void {
        for (const key of Object.keys(target)) {
            const original = target[key];
            // Lowercase skips classes such as `Stats` and `Dirent`.
            if (typeof original !== "function" || !/^[a-z]/.test(key)) {
                continue;
            }
            const name = prefix + key;
            const tracksCallback = !key.endsWith("Sync") && !LISTENERS.has(key);
            const wrapped = function(this: unknown, ...args: unknown[]): unknown {
                lastActivity = performance.now();
                if (probe.counting) {
                    counts.set(name, (counts.get(name) ?? 0) + 1);
                }
                const callback = args.at(-1);
                if (tracksCallback && typeof callback === "function") {
                    inflight++;
                    args[args.length - 1] = function(this: unknown, ...callbackArgs: unknown[]): unknown {
                        done();
                        return callback.apply(this, callbackArgs);
                    };
                }
                const result: unknown = original.apply(this, args);
                if (result instanceof Promise) {
                    inflight++;
                    result.then(done, done);
                }
                return result;
            };
            // E.g. `realpath.native` and `util.promisify.custom`.
            for (const property of Reflect.ownKeys(original)) {
                if (!COPIED_PROPERTIES_EXCLUDED.has(property)) {
                    Object.defineProperty(wrapped, property, Object.getOwnPropertyDescriptor(original, property)!);
                }
            }
            target[key] = wrapped;
        }
    }

    wrapAll(fs as unknown as Record<string, unknown>, "");
    wrapAll(fs.promises as unknown as Record<string, unknown>, "promises.");
    syncBuiltinESMExports();
    return probe;
}
