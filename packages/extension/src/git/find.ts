import { fromEnvironment, fromPath, GitContext, PersistentCLIContext } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isErr, isOk, unwrap } from "monolithic-git-interop/util/result";
import * as path from "node:path";
import type { OutputChannel } from "vscode";
import { snoopOnStream, SnoopStream } from "../util/snoop-stream.js";

export interface IGit {
    path: string;
    version: string;
    context: GitContext;
}

export async function findGit(outputChannel: OutputChannel, hints: string[]): Promise<IGit> {
    const services = createServices();

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
            cli: async (c, a) => {
                const logId = `CMD_${runCounter++}`;

                // Log input
                outputChannel.appendLine(`${logId} > git ${a.join(" ")}`);

                // Log output
                const stdoutLog = (msg: string) => outputChannel.appendLine(`${logId} < [STDOUT] ${msg}`);
                const stdout = c.stdout
                    ? snoopOnStream(c.stdout, stdoutLog)
                    : new SnoopStream(stdoutLog);
                const stderrLog = (msg: string) => outputChannel.appendLine(`${logId} < [STDERR] ${msg}`);
                const stderr = c.stderr
                    ? snoopOnStream(c.stderr, stderrLog)
                    : new SnoopStream(stderrLog);

                const result = await context.cli({ ...c, stderr, stdout }, a);

                // Log result
                if (isErr(result)) {
                    const err = unwrap(result);
                    outputChannel.appendLine(`${logId} < ERROR ${err.type.description}`);
                } else {
                    outputChannel.appendLine(`${logId} < SUCCESS`);
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
