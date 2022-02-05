import { ERROR_GIT_NOT_FOUND } from "../errors.js";
import { err, isErr, ok, Result, unwrap } from "../func-result.js";
import { ContextCreationErrors, GitContext, PersistentCLIContext } from "./context.js";
import { create, SpawnFn } from "./create.js";
import { readToString } from "./helpers/read-to-string.js";

export type FromPathServices = {
    fs: {
        exists: (path: string) => boolean;
    };
    child_process: {
        spawn: SpawnFn;
    };
    process: {
        env: NodeJS.ProcessEnv;
    };
};

/**
 * Creates git context from path.
 * @param gitPath Absolute path to git executable.
 */
export async function fromPath(
    gitPath: string,
    cliContext: PersistentCLIContext,
    services: FromPathServices,
): Promise<Result<GitContext, ContextCreationErrors>> {
    if (services.fs.exists(gitPath)) {
        const cli = create(gitPath, cliContext, services);
        const versionResult = await readToString({ cli, cwd: process.cwd() }, ["--version"]);

        if (isErr(versionResult)) {
            // TODO Make more specific, or more generic (this is an issue getting the version)
            return err({ type: ERROR_GIT_NOT_FOUND });
        }

        return ok({
            cli,
            version: unwrap(versionResult).replace(/^git version /, "").trim(),
        });
    }

    return err({ type: ERROR_GIT_NOT_FOUND });
}
