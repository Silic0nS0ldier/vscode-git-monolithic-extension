import { GitError } from "../git/error.js";

/**
 * @deprecated This is inherently prone to failure.
 */
export function isCancelledError(err: unknown): boolean {
    let msg = "";
    if (err instanceof Error) {
        msg = err.message;
    }
    if (!!msg && err instanceof GitError && err.stderr) {
        msg = err.stderr;
    }

    return /Cancelled/i.test(msg);
}
