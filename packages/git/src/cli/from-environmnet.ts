import { ERROR_GIT_NOT_FOUND } from "../errors.js";
import { err, Result } from "../func-result.js";
import { ContextCreationErrors, GitContext, PersistentCLIContext } from "./context.js";
import { SpawnFn } from "./create.js";
import { fromPath } from "./from-path.js";

export type FromEnvironmentServices = {
    fs: {
        exists: (path: string) => boolean;
    };
    shell: {
        which: (cmd: string, options: { path: string; pathExt: string }) => Promise<string>;
    };
    child_process: {
        spawn: SpawnFn;
    };
    process: {
        env: NodeJS.ProcessEnv;
    };
};

export type Environment = {
    path: string;
    pathExt: string;
};

/**
 * Creates git context from environment (e.g. `PATH`).
 */
export async function fromEnvironment(
    env: Environment,
    cliContext: PersistentCLIContext,
    services: FromEnvironmentServices,
): Promise<Result<GitContext, ContextCreationErrors>> {
    try {
        // TODO Fix types in DT so we can use nothrow
        const gitPath = await services.shell.which("git", { path: env.path, pathExt: env.pathExt });
        return await fromPath(gitPath, cliContext, services);
    } catch {
        return err({ type: ERROR_GIT_NOT_FOUND });
    }
}
