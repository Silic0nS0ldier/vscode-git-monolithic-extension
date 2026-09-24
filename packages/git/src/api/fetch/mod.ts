import type { CLIErrors, GitContext } from "../../cli/context.js";
import { ERROR_NON_ZERO_EXIT } from "../../errors.js";
import { isOk, ok, type Result, unwrap } from "../../func-result.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

/** Git names only the first ref it could not find, then aborts the whole fetch. */
const MISSING_REF = /^fatal: couldn't find remote ref (.+)$/mu;

type NoRefs = { readonly refs?: never; readonly skipMissingRefs?: never };

/** Git takes refs only alongside a remote, and `--all` only instead of one. */
type FetchTarget =
    /** The upstream of the current branch. */
    | NoRefs & { readonly remote?: never; readonly all?: never }
    /** One remote, and optionally only some of its refs. */
    | {
        readonly remote: string;
        /**
         * Fetched instead of the remote's configured refspecs. Tracking refs still update
         * through those refspecs. An empty list fetches nothing.
         */
        readonly refs?: readonly string[];
        /** Drop refs the remote no longer has, rather than failing the fetch over them. */
        readonly skipMissingRefs?: boolean;
        readonly all?: never;
    }
    /** Every configured remote. Maps to `--all`. */
    | NoRefs & { readonly remote?: never; readonly all: true };

export type FetchOptions = FetchTarget & {
    /** Delete tracking refs whose remote counterpart is gone. Maps to `--prune`. */
    readonly prune?: boolean;
    /** Limit the history fetched to this many commits. Maps to `--depth=<n>`. */
    readonly depth?: number;
    /** Advertised to HTTP remotes through `GIT_HTTP_USER_AGENT`. */
    readonly userAgent?: string;
    /** Additional environment for the transport, e.g. credential helper wiring. */
    readonly env?: { readonly [key: string]: string | undefined };
    readonly signal?: AbortSignal;
};

/**
 * Download objects and refs from a remote.
 *
 * Wraps `git fetch [<remote> [<ref>...]] [--all] [--prune] [--depth=<n>]`.
 *
 * Refs are split into chunks that stay under the platform command-line length limit;
 * chunks are fetched sequentially, and the first failing chunk short-circuits the rest.
 */
export async function fetch(
    git: GitContext,
    cwd: string,
    options: FetchOptions = {},
): Promise<Result<void, CLIErrors>> {
    const flags: string[] = [];

    if (options.prune) {
        flags.push("--prune");
    }

    if (typeof options.depth === "number") {
        flags.push(`--depth=${options.depth}`);
    }

    const env = { ...options.env };
    if (options.userAgent !== undefined) {
        env["GIT_HTTP_USER_AGENT"] = options.userAgent;
    }

    // A remote sets the pace, so the shared invocation timeout does not apply.
    const invoke = (target: readonly string[]) =>
        git.cli({ cwd, env, signal: options.signal, timeout: Number.POSITIVE_INFINITY }, [
            "fetch",
            ...target,
            ...flags,
        ]);

    if (options.remote === undefined) {
        return invoke(options.all ? ["--all"] : []);
    }

    if (options.refs === undefined) {
        return invoke([options.remote]);
    }

    for (const chunk of splitInChunks(options.refs)) {
        let pending = chunk;

        while (pending.length > 0) {
            const result = await invoke([options.remote, ...pending]);

            if (isOk(result)) {
                break;
            }

            const error = unwrap(result);
            const missing = options.skipMissingRefs && error.type === ERROR_NON_ZERO_EXIT
                ? MISSING_REF.exec(error.cause.stderr)?.[1]
                : undefined;

            if (missing === undefined || !pending.includes(missing)) {
                return result;
            }

            pending = pending.filter(ref => ref !== missing);
        }
    }

    return ok(undefined);
}
