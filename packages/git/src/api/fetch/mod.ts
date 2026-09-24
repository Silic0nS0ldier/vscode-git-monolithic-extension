import type { CLIErrors, GitContext } from "../../cli/context.js";
import type { Result } from "../../func-result.js";

/** Git takes a ref only alongside a remote, and `--all` only instead of one. */
type FetchTarget =
    /** The upstream of the current branch. */
    | { readonly remote?: never; readonly ref?: never; readonly all?: never }
    /** One remote, and optionally a single ref from it. */
    | { readonly remote: string; readonly ref?: string; readonly all?: never }
    /** Every configured remote. Maps to `--all`. */
    | { readonly remote?: never; readonly ref?: never; readonly all: true };

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
 * Wraps `git fetch [<remote> [<ref>]] [--all] [--prune] [--depth=<n>]`.
 */
export async function fetch(
    git: GitContext,
    cwd: string,
    options: FetchOptions = {},
): Promise<Result<void, CLIErrors>> {
    const args = ["fetch"];

    if (options.remote !== undefined) {
        args.push(options.remote);

        if (options.ref !== undefined) {
            args.push(options.ref);
        }
    } else if (options.all) {
        args.push("--all");
    }

    if (options.prune) {
        args.push("--prune");
    }

    if (typeof options.depth === "number") {
        args.push(`--depth=${options.depth}`);
    }

    const env = { ...options.env };
    if (options.userAgent !== undefined) {
        env["GIT_HTTP_USER_AGENT"] = options.userAgent;
    }

    // A remote sets the pace, so the shared invocation timeout does not apply.
    return git.cli({ cwd, env, signal: options.signal, timeout: Number.POSITIVE_INFINITY }, args);
}
