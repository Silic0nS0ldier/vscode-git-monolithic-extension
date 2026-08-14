import { type Readable, Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import {
    createError,
    createNonZeroExitError,
    ERROR_CANCELLED,
    ERROR_GENERIC,
    ERROR_TIMEOUT,
    type GenericError,
} from "../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../func-result.js";
import type { ChildProcessService, ProcessService } from "../services/mod.js";
import type { CLI, CLIResult, PersistentCLIContext } from "./context.js";

/** Enough to hold a wall of merge conflicts, small enough to carry for every invocation. */
const OUTPUT_TAIL_LIMIT = 64 * 1024;

/** Bounded because git can leave a background process holding the pipe open. */
const OUTPUT_DRAIN_TIMEOUT_MS = 500;

type OutputTail = {
    /** Resolves once the source stream has been fully consumed. */
    readonly ended: Promise<void>;
    text(): string;
};

/**
 * Retains the last `limit` bytes written to `source`.
 *
 * Consuming the stream is not optional: an unread pipe stalls the child once its buffer
 * fills.
 */
function tailOf(source: Readable, limit: number): OutputTail {
    const chunks: Buffer[] = [];
    let size = 0;

    const sink = new Writable({
        write(chunk: Buffer, _encoding, cb) {
            chunks.push(chunk);
            size += chunk.length;
            while (chunks.length > 1 && size - chunks[0].length >= limit) {
                size -= chunks.shift()!.length;
            }
            cb();
        },
    });
    source.pipe(sink);

    return {
        ended: new Promise<void>(resolve => void sink.once("finish", () => resolve())),
        text: () => Buffer.concat(chunks).subarray(-limit).toString("utf-8"),
    };
}

export type ChildProcess = {
    readonly stdout: Readable;
    readonly stderr: Readable;
    once(event: "error", listener: (error: Error) => void): ChildProcess;
    once(event: "exit", listener: (code: number, signal: NodeJS.Signals) => void): ChildProcess;
    readonly connected: boolean;
    kill(signal?: number | NodeJS.Signals): boolean;
    readonly pid?: number;
};

export type SpawnFn = (
    command: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; cwd: string; stdio: "pipe" },
) => ChildProcess;

export type LogFn = (
    msg: string,
) => void;

export type CreateServices =
    & ChildProcessService
    & ProcessService;

/**
 * Creates a wrapper around the git CLI.
 * @todo Confirm child process errors are handled
 * @param executablePath Path to git executable.
 * @param persistentContext Persistent context for CLI. Provides a mechanism for bound control and monitoring.
 */
export function create(executablePath: string, persistentContext: PersistentCLIContext, services: CreateServices): CLI {
    return async function cli(context, args) {
        // Compose environment variables
        const env = {
            ...services.process.env,
            ...persistentContext.env,
            ...context.env ?? {},
        };
        const cwd = context.cwd;

        const cmdContext = {
            args,
            cwd,
            executablePath,
        };

        const cpRes = ((): Result<ChildProcess, GenericError> => {
            try {
                return ok(services.child_process.spawn(executablePath, args, { cwd, env, stdio: "pipe" }));
            } catch (error) {
                return err(createError(ERROR_GENERIC, { cmdContext, error }));
            }
        })();

        if (isErr(cpRes)) {
            return cpRes;
        }

        const cp = unwrap(cpRes);
        const pid = cp.pid;
        context.onSpawn?.(pid ?? -1);

        const stdoutTail = tailOf(cp.stdout, OUTPUT_TAIL_LIMIT);
        const stderrTail = tailOf(cp.stderr, OUTPUT_TAIL_LIMIT);

        if (context.stdout) {
            cp.stdout.pipe(context.stdout);
        }

        if (context.stderr) {
            cp.stderr.pipe(context.stderr);
        }

        // TODO Ensure all promises resolve so that everything can be GCed
        const timeoutMs = context.timeout ?? persistentContext.timeout;
        const timeoutSignal = Number.isFinite(timeoutMs) ? AbortSignal.timeout(timeoutMs) : undefined;
        const externalSignal = context.signal;

        if (externalSignal?.aborted) {
            if (cp.connected) {
                cp.kill();
            }
            return err(createError(ERROR_CANCELLED, { ...cmdContext, stderr: stderrTail.text() }));
        }

        const signals = [timeoutSignal, externalSignal].filter((s): s is AbortSignal => s !== undefined);
        const abortSignal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

        const onAbort = new Promise<CLIResult>(resolve => {
            abortSignal?.addEventListener("abort", () => {
                const cause = timeoutSignal?.aborted ? ERROR_TIMEOUT : ERROR_CANCELLED;
                resolve(err(createError(cause, { ...cmdContext, stderr: stderrTail.text() })));
            }, { once: true });
        });
        const onError = new Promise<CLIResult>(resolve =>
            void cp.once("error", (error) => resolve(err(createError(ERROR_GENERIC, { cmdContext, error }))))
        );
        const onExit = new Promise<CLIResult>(resolve =>
            void cp.once("exit", (code, signal) => resolve(ok({ code, signal })))
        );

        // NOTE onExit must come last, unit tests rely on this (they are time optimised)
        const result = await Promise.race([onAbort, onError, onExit]);

        if (isErr(result)) {
            // End process
            if (cp.connected) {
                // TODO monitor for errors killing
                cp.kill();
            }
            // TODO Refine generic error into something more specific
            return result;
        }

        const exitState = unwrap(result);

        if (exitState.code !== 0) {
            // The process is gone, but its output can still be in flight.
            await Promise.race([
                Promise.all([stdoutTail.ended, stderrTail.ended]),
                delay(OUTPUT_DRAIN_TIMEOUT_MS, undefined, { ref: false }),
            ]);

            return err(createNonZeroExitError({
                ...cmdContext,
                exitCode: exitState.code,
                signal: exitState.signal,
                stderr: stderrTail.text(),
                stdout: stdoutTail.text(),
            }));
        }

        return ok(void 0);
    };
}
