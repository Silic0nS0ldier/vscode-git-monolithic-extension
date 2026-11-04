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
}

export async function findGit(hints: string[]): Promise<IGit> {
    const services = createServices(
        // TODO Use tiered logging instead of always using trace
        msg => trace(msg),
    );

    const persistentContext: PersistentCLIContext = { env: process.env, timeout: 30_000 };

    for (const hint of hints) {
        const result = await fromPath(path.resolve(hint), persistentContext, services);

        if (isOk(result)) {
            const context = unwrap(result);
            return {
                context,
                path: context.path,
                version: context.version,
            };
        }
    }

    const result = await fromEnvironment(persistentContext, services);

    if (isOk(result)) {
        let runCounter = 0;
        const context = unwrap(result);
        const monitoredContext: GitContext = {
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
        return {
            context: monitoredContext,
            path: monitoredContext.path,
            version: monitoredContext.version,
        };
    }

    throw new Error("Git installation not found.");
}
