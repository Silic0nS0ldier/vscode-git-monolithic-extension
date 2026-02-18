import { fromEnvironment, fromPath, type GitContext, type PersistentCLIContext } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isErr, isOk, unwrap } from "monolithic-git-interop/util/result";
import * as path from "node:path";
import type { OutputChannel } from "vscode";
import { DurationFormat } from "@formatjs/intl-durationformat";
import { Temporal } from "@js-temporal/polyfill";
import { snoopOnStream, SnoopStream } from "../util/snoop-stream.js";

export interface IGit {
    path: string;
    version: string;
    context: GitContext;
}

export async function findGit(outputChannel: OutputChannel, hints: string[]): Promise<IGit> {
    const services = createServices(msg => outputChannel.appendLine(msg));

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
                outputChannel.appendLine(`${invocId} > git ${args.join(" ")}`);

                // Log output
                const stdoutLog = (msg: string): void => outputChannel.appendLine(`${invocId} < [STDOUT] ${msg}`);
                const stdout = cliContext.stdout
                    ? snoopOnStream(cliContext.stdout, stdoutLog)
                    : new SnoopStream(stdoutLog);
                const stderrLog = (msg: string): void => outputChannel.appendLine(`${invocId} < [STDERR] ${msg}`);
                const stderr = cliContext.stderr
                    ? snoopOnStream(cliContext.stderr, stderrLog)
                    : new SnoopStream(stderrLog);

                let pid: number = -1;
                const onSpawn = (spawnPid: number): void => {
                    pid = spawnPid;
                    cliContext.onSpawn?.(spawnPid);
                }

                const start = Date.now();
                const result = await context.cli(
                    {
                        ...cliContext,
                        stderr,
                        stdout,
                        onSpawn,
                    }, 
                    args,);

                const duration = Temporal.Duration.from({ milliseconds: Date.now() - start })
                // TODO Remove ponyfill once VSCode updates to NodeJS v23 or higher
                const durationStr = new DurationFormat("en", { style: "narrow" }).format(duration);

                // Log result
                if (isErr(result)) {
                    const err = unwrap(result);
                    outputChannel.appendLine(`${invocId} < ERROR (PID = ${pid}, Duration = ${durationStr}) ${err.type.description}`);
                } else {
                    outputChannel.appendLine(`${invocId} < SUCCESS (PID = ${pid}, Duration = ${durationStr})`);
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
