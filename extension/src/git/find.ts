import { fromEnvironment, fromPath, type GitContext, type PersistentCLIContext } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isErr, isOk, unwrap } from "monolithic-git-interop/util/result";
import * as path from "node:path";
import { trace } from "../tracing.js";
import { snoopOnStream, SnoopStream } from "../util/snoop-stream.js";

export interface IGit {
    path: string;
    version: string;
    context: GitContext;
    /** Creates a context for the same git binary with different persistent settings, such as the timeout. */
    recreateContext(persistentContext: PersistentCLIContext): Promise<GitContext>;
}

export async function findGit(hints: string[], persistentContext: PersistentCLIContext): Promise<IGit> {
    const services = createServices(
        // TODO Use tiered logging instead of always using trace
        msg => trace(msg),
    );

    // Shared by every context it wraps, so invocation ids stay unique when a context is recreated.
    let runCounter = 0;

    function monitor(context: GitContext): GitContext {
        return {
            ...context,
            cli: async (cliContext, args) => {
                const invocId = `CMD_0_${runCounter++}`;

                // Log input
                trace(`${invocId} > git ${args.join(" ")}`);

                // Log output
                const stdoutLog = (msg: string): void => trace(`${invocId} < [STDOUT] ${msg}`);
                const stdout = cliContext.stdout
                    ? snoopOnStream(cliContext.stdout, stdoutLog)
                    : new SnoopStream(stdoutLog);
                const stderrLog = (msg: string): void => trace(`${invocId} < [STDERR] ${msg}`);
                const stderr = cliContext.stderr
                    ? snoopOnStream(cliContext.stderr, stderrLog)
                    : new SnoopStream(stderrLog);

                let pid: number = -1;
                const onSpawn = (spawnPid: number): void => {
                    pid = spawnPid;
                    cliContext.onSpawn?.(spawnPid);
                };

                const start = Date.now();
                const result = await context.cli(
                    {
                        ...cliContext,
                        stderr,
                        stdout,
                        onSpawn,
                    },
                    args,
                );

                const durationStr = new Intl.DurationFormat("en", { style: "narrow" }).format({
                    milliseconds: Date.now() - start,
                });

                // Log result
                if (isErr(result)) {
                    const err = unwrap(result);
                    trace(
                        `${invocId} < FAILED (PID = ${pid}, Duration = ${durationStr}) ${err.type.description}`,
                    );
                } else {
                    trace(`${invocId} < SUCCESS (PID = ${pid}, Duration = ${durationStr})`);
                }

                return result;
            },
        };
    }

    function found(context: GitContext, wrap: (context: GitContext) => GitContext): IGit {
        const wrapped = wrap(context);
        return {
            context: wrapped,
            path: wrapped.path,
            version: wrapped.version,
            async recreateContext(newPersistentContext) {
                const result = await fromPath(context.path, newPersistentContext, services);
                if (isErr(result)) {
                    throw new Error(`Could not recreate the context for ${context.path}`, { cause: unwrap(result) });
                }
                return wrap(unwrap(result));
            },
        };
    }

    for (const hint of hints) {
        const result = await fromPath(path.resolve(hint), persistentContext, services);

        if (isOk(result)) {
            return found(unwrap(result), context => context);
        }
    }

    const result = await fromEnvironment(persistentContext, services);

    if (isOk(result)) {
        return found(unwrap(result), monitor);
    }

    throw new Error("Git installation not found.");
}
