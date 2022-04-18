import type { Readable } from "stream";
import {
    createError,
    ERROR_CANCELLED,
    ERROR_GENERIC,
    ERROR_NON_ZERO_EXIT,
    ERROR_TIMEOUT,
    GenericError,
} from "../errors.js";
import { err, isErr, ok, Result, unwrap } from "../func-result.js";
import type { CLI, CLIResult, PersistentCLIContext } from "./context.js";

export type ChildProcess = {
    readonly stdout: Readable;
    readonly stderr: Readable;
    once(event: "error", listener: (error: Error) => void): ChildProcess;
    once(event: "exit", listener: (code: number, signal: NodeJS.Signals) => void): ChildProcess;
    readonly connected: boolean;
    kill(signal?: number | NodeJS.Signals): boolean;
};

export type SpawnFn = (
    command: string,
    args: string[],
    options: { env: NodeJS.ProcessEnv; cwd: string; stdio: "pipe" },
) => ChildProcess;

export type CreateServices = {
    child_process: {
        spawn: SpawnFn;
    };
    process: {
        env: NodeJS.ProcessEnv;
    };
};

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
            env,
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

        if (context.stdout) {
            cp.stdout.pipe(context.stdout);
        }
        if (context.stderr) {
            cp.stderr.pipe(context.stderr);
        }

        // TODO Ensure all promises resolve so that everything can be GCed
        // TODO Clear timeout, handle Infinity (timeout will trigger immediately)
        const onTimeout = new Promise<CLIResult>(resolve =>
            void setTimeout(
                () => resolve(err(createError(ERROR_TIMEOUT, cmdContext))),
                context.timeout ?? persistentContext.timeout,
            )
        );
        const onAbort = new Promise<CLIResult>(resolve => {
            if (context.signal) {
                if (context.signal.aborted) {
                    return resolve(err(createError(ERROR_CANCELLED, cmdContext)));
                }
                context.signal.onabort = (): void => void resolve(err(createError(ERROR_CANCELLED, cmdContext)));
            }
        });
        const onError = new Promise<CLIResult>(resolve =>
            void cp.once("error", (error) => resolve(err(createError(ERROR_GENERIC, { cmdContext, error }))))
        );
        const onExit = new Promise<CLIResult>(resolve =>
            void cp.once("exit", (code, signal) => resolve(ok({ code, signal })))
        );

        // NOTE onExit must come last, unit tests rely on this (they are time optimised)
        const result = await Promise.race([onTimeout, onError, onAbort, onExit]);

        if (isErr(result)) {
            // End process
            if (cp.connected) {
                // TODO monitor for errors killing
                cp.kill();
            }
            // TODO Refine generic error into something more specific
            return result;
        }

        const exitstate = unwrap(result);

        if (exitstate.code !== 0) {
            return err(createError(ERROR_NON_ZERO_EXIT, { cmdContext, exitstate }));
        }

        return ok(void 0);
    };
}
