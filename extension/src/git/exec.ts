import type * as cp from "node:child_process";
import { dispose, type IDisposable, toDisposable } from "../util/disposals.js";
import { cpErrorHandler, GitError } from "./error.js";

export interface IExecutionResult<T extends string | Buffer> {
    exitCode: number;
    stdout: T;
    stderr: string;
}

export async function exec(
    child: cp.ChildProcess,
    abortSignal?: AbortSignal,
): Promise<IExecutionResult<Buffer>> {
    if (!child.stdout || !child.stderr) {
        throw new GitError({ message: "Failed to get stdout or stderr from git process." });
    }

    if (abortSignal?.aborted) {
        throw new GitError({ message: "Cancelled" });
    }

    const disposables: IDisposable[] = [];

    const once = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void): void => {
        ee.once(name, fn);
        disposables.push(toDisposable(() => ee.removeListener(name, fn)));
    };

    const on = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void): void => {
        ee.on(name, fn);
        disposables.push(toDisposable(() => ee.removeListener(name, fn)));
    };

    let result = Promise.all<any>([
        new Promise<number>((c, e) => {
            once(child, "error", cpErrorHandler(e));
            once(child, "exit", c);
        }),
        new Promise<Buffer>(c => {
            const buffers: Buffer[] = [];
            on(child.stdout!, "data", (b: Buffer) => buffers.push(b));
            once(child.stdout!, "close", () => c(Buffer.concat(buffers)));
        }),
        new Promise<string>(c => {
            const buffers: Buffer[] = [];
            on(child.stderr!, "data", (b: Buffer) => buffers.push(b));
            once(child.stderr!, "close", () => c(Buffer.concat(buffers).toString("utf8")));
        }),
    ]) as Promise<[number, Buffer, string]>;

    if (abortSignal) {
        const cancellationPromise = new Promise<[number, Buffer, string]>((_, e) => {
            abortSignal.addEventListener("abort", () => {
                try {
                    child.kill();
                } catch (err) {
                    // noop
                }

                e(new GitError({ message: "Cancelled" }));
            });
        });

        result = Promise.race([result, cancellationPromise]);
    }

    try {
        const [exitCode, stdout, stderr] = await result;
        return { exitCode, stderr, stdout };
    } finally {
        dispose(disposables);
    }
}
