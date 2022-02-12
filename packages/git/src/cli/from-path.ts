import { version } from "../api/version/mod.js";
import {
    createError,
    ERROR_GIT_NOT_FOUND,
    ERROR_GIT_UNUSABLE,
    GitNotFoundError,
    GitUnusableError,
    TimeoutError,
} from "../errors.js";
import { err, isErr, ok, Result, unwrap } from "../func-result.js";
import { isMacOS } from "../helpers/platform-matchers.js";
import { GitContext, PersistentCLIContext } from "./context.js";
import { create, SpawnFn } from "./create.js";
import { readToString } from "./helpers/read-to-string.js";

export type FromPathErrors =
    | GitNotFoundError
    | TimeoutError
    | GitUnusableError;

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
    os: {
        platform: string;
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
): Promise<Result<GitContext, FromPathErrors>> {
    if (services.fs.exists(gitPath)) {
        if (await isGitExotic(gitPath, services)) {
            return err(createError(ERROR_GIT_UNUSABLE, "Marked exotic"));
        }

        const cli = create(gitPath, cliContext, services);
        const versionResult = await version({ cli, version: "PENDING", path: gitPath });

        if (isErr(versionResult)) {
            return err(createError(ERROR_GIT_UNUSABLE, unwrap(versionResult)));
        }

        return ok({
            cli,
            version: unwrap(versionResult),
            path: gitPath,
        });
    }

    return err(createError(ERROR_GIT_NOT_FOUND));
}

export const darwinBuiltinGitPath = "/usr/bin/git";

type IsGitExoticServices = {
    child_process: {
        spawn: SpawnFn;
    };
    process: {
        env: NodeJS.ProcessEnv;
    };
    os: {
        platform: string;
    };
};

/**
 * Checks git path for any exotic behaviours that will make it unsuitable for use.
 */
async function isGitExotic(path: string, services: IsGitExoticServices): Promise<boolean> {
    if (isMacOS(services.os.platform)) {
        if (path === darwinBuiltinGitPath) {
            // MacOS by default (dated 2022-02-10) provides git via XCode
            // However if XCode/XCode Command Line Tools are not installed, its just an alias for he installer
            const cli = create("xcode-select", { env: {}, timeout: 5_000 }, services);
            const result = await readToString({ cli, cwd: "/" }, ["-p"]);
            return isErr(result);
        }
    }

    return false;
}
