import { fromEnvironment, fromPath, GitContext } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isOk, unwrap } from "monolithic-git-interop/util/result";
import * as path from "node:path";

export interface IGit {
    path: string;
    version: string;
    context: GitContext;
}

export async function findGit(hints: string[]): Promise<IGit> {
    const services = createServices();
    for (const hint of hints) {
        const result = await fromPath(path.resolve(hint), { env: process.env, timeout: 30_000 }, services);

        if (isOk(result)) {
            const context = unwrap(result);
            return {
                path: context.path,
                version: context.version,
                context,
            };
        }
    }

    const result = await fromEnvironment({ env: process.env, timeout: 30_000 }, services);

    if (isOk(result)) {
        const context = unwrap(result);
        return {
            path: context.path,
            version: context.version,
            context,
        };
    }

    throw new Error("Git installation not found.");
}
