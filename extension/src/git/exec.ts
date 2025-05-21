import type * as cp from "node:child_process";
import { dispose, type IDisposable, toDisposable } from "../util/disposals.js";
import { cpErrorHandler, GitError } from "./error.js";
import { err, isErr, ok, unwrap, type Result } from "monolithic-git-interop/util/result";

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

    const disposables: IDisposable[] = [];

    const once = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void): void => {
        ee.once(name, fn);
        disposables.push(toDisposable(() => ee.removeListener(name, fn)));
    };

    const on = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void): void => {
        ee.on(name, fn);
        disposables.push(toDisposable(() => ee.removeListener(name, fn)));
    };

    let pendingResult = (
        Promise.all<any>([
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
        ]) as Promise<[number, Buffer, string]>
    ).then(
        v => ok<[number, Buffer<ArrayBufferLike>, string], unknown>(v),
        e => err<[number, Buffer<ArrayBufferLike>, string], unknown>(e)
    ) as Promise<Result<[number, Buffer<ArrayBufferLike>, string], unknown>>;

    if (abortSignal) {
        const cancellationPromise = new Promise<Result<[number, Buffer<ArrayBufferLike>, string], unknown>>((r) => {
            abortSignal.addEventListener("abort", () => {
                try {
                    child.kill();
                } catch (err) {
                    // noop
                }

                r(err(new GitError({ message: "Cancelled" })));
            });
        });

        pendingResult = Promise.race([pendingResult, cancellationPromise]);
    }

    try {
        let result = await pendingResult;
        if (isErr(result)) {
            return result;
        }

        const [exitCode, stdout, stderr] = unwrap(result);
        return ok({ exitCode, stderr, stdout });
    } finally {
        dispose(disposables);
    }
}
