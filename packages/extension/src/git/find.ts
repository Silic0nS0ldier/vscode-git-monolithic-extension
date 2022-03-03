import { fromEnvironment, fromPath, GitContext, PersistentCLIContext } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isOk, unwrap } from "monolithic-git-interop/util/result";
import * as path from "node:path";
import { OutputChannel } from "vscode";

export interface IGit {
    path: string;
    version: string;
    context: GitContext;
}

export async function findGit(outputChannel: OutputChannel, hints: string[]): Promise<IGit> {
    const services = createServices();
    const log = outputChannel.appendLine.bind(outputChannel);

    const persistentContext: PersistentCLIContext = { __UNSTABLE__log: log, env: process.env, timeout: 30_000 };

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
        const context = unwrap(result);
        return {
            context,
            path: context.path,
            version: context.version,
        };
    }

    throw new Error("Git installation not found.");
}
