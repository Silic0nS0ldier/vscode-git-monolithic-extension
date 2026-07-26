import { version } from "../api/version/mod.js";
import {
    createError,
    ERROR_GIT_NOT_FOUND,
    ERROR_GIT_UNUSABLE,
    type GitNotFoundError,
    type GitUnusableError,
    type TimeoutError,
} from "../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../func-result.js";
import { isMacOS } from "../helpers/platform-matchers.js";
import type {
    ChildProcessService,
    FsService,
    OsService,
    ProcessService,
} from "../services/mod.js";
import type { GitContext, PersistentCLIContext } from "./context.js";
import { create } from "./create.js";
import { readToString } from "./helpers/read-to-string.js";

export type FromPathErrors =
    | GitNotFoundError
    | TimeoutError
    | GitUnusableError;

export type FromPathServices =
    & FsService
    & ChildProcessService
    & ProcessService
    & OsService;

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
        const versionResult = await version({
            cli,
            path: gitPath,
            version: "PENDING",
        });

        if (isErr(versionResult)) {
            return err(createError(ERROR_GIT_UNUSABLE, unwrap(versionResult)));
        }

        return ok({
            cli,
            path: gitPath,
            version: unwrap(versionResult),
        });
    }

    return err(createError(ERROR_GIT_NOT_FOUND));
}

export const darwinBuiltinGitPath = "/usr/bin/git";

type IsGitExoticServices =
    & ChildProcessService
    & ProcessService
    & OsService;

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
