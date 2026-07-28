import type * as cp from "node:child_process";
import { once } from "node:events";
import { buffer, text } from "node:stream/consumers";
import { cpErrorHandler, GitError } from "./error.js";
import { err, ok, type Result } from "monolithic-git-interop/util/result";

export interface IExecutionResult<T extends string | Buffer> {
    exitCode: number;
    stdout: T;
    stderr: string;
}

export async function exec(
    child: cp.ChildProcess,
    abortSignal?: AbortSignal,
): Promise<Result<IExecutionResult<Buffer>, unknown>> {
    if (!child.stdout || !child.stderr) {
        return err(new GitError({ message: "Failed to get stdout or stderr from git process." }));
    }

    if (abortSignal?.aborted) {
        return err(new GitError({ message: "Cancelled" }));
    }

    // Internal signal used to detach the abort listener below once the work has
    // finished, so we do not leak a listener onto a longer-lived external abort
    // signal after this call returns.
    const cleanup = new AbortController();

    // Kill the child when the caller aborts. The child's natural "exit" event
    // fires as a consequence, resolving the promise below — no separate
    // cancellation racer is required.
    abortSignal?.addEventListener("abort", () => {
        try {
            child.kill();
        } catch {
            // noop
        }
    }, { once: true, signal: cleanup.signal });

    try {
        // `events.once` auto-removes its listener when the event fires; whichever
        // of "exit" or "error" loses the race leaves at most a single dangling
        // listener that is cleaned up when the ChildProcess is GC'd.
        const onExit = (once(child, "exit") as Promise<[number | null]>)
            .then(([code]) => code ?? 0);
        const onError = once(child, "error")
            .then(([e]) => new Promise<number>((_, reject) => cpErrorHandler(reject)(e)));
        const runningChild = Promise.race<number>([onExit, onError]);

        const [exitCode, stdout, stderr] = await Promise.all([
            runningChild,
            buffer(child.stdout),
            text(child.stderr),
        ]);

        if (abortSignal?.aborted) {
            return err(new GitError({ message: "Cancelled" }));
        }

        return ok({ exitCode, stderr, stdout });
    } catch (e) {
        return err(e);
    } finally {
        cleanup.abort();
    }
}
