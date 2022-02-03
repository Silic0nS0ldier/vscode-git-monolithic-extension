import { Readable } from "stream";
import { ERROR_CANCELLED, ERROR_GENERIC, ERROR_NON_ZERO_EXIT, ERROR_TIMEOUT } from "../errors.js";
import { err, isErr, ok, unwrap } from "../func-result.js";
import { CLI, CLIResult, PersistentCLIContext } from "./context.js";

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

        const cp = services.child_process.spawn(executablePath, args, { env, cwd, stdio: "pipe" });

        if (context.stdout) {
            cp.stdout.pipe(context.stdout);
        }
        if (context.stderr) {
            cp.stderr.pipe(context.stderr);
        }

        const onTimeout = new Promise<CLIResult>(resolve =>
            void setTimeout(
                () => resolve(err({ type: ERROR_TIMEOUT })),
                context.timeout ?? persistentContext.timeout,
            )
        );
        const onAbort = new Promise<CLIResult>(resolve => {
            if (context.signal) {
                if (context.signal.aborted) {
                    return resolve(err({ type: ERROR_CANCELLED }));
                }
                context.signal.onabort = () => void resolve(err({ type: ERROR_CANCELLED }));
            }
        });
        const onError = new Promise<CLIResult>(resolve =>
            void cp.once("error", (error) => resolve(err({ type: ERROR_GENERIC, cause: error })))
        );
        const onExit = new Promise<CLIResult>(resolve =>
            void cp.once("exit", (code, signal) => resolve(ok({ code, signal })))
        );

        const result = await Promise.race([onTimeout, onError, onExit, onAbort]);

        if (isErr(result)) {
            // End process
            if (cp.connected) {
                // TODO monitor for errors killing
                cp.kill();
            }
            // TODO Refine generic error into something more specific
            return result;
        }

        const okResult = unwrap(result);

        if (okResult.code !== 0) {
            return err({ type: ERROR_NON_ZERO_EXIT });
        }

        return ok(undefined);
    };
}
