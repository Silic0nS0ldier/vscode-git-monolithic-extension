import { createError, ERROR_GIT_NOT_FOUND, type GitNotFoundError, type GitUnusableError, type TimeoutError } from "../errors.js";
import { err, type Result } from "../func-result.js";
import { isMacOS, isWindows } from "../helpers/platform-matchers.js";
import type { GitContext, PersistentCLIContext } from "./context.js";
import type { SpawnFn } from "./create.js";
import { darwinBuiltinGitPath, fromPath } from "./from-path.js";

export type FromEnvironmentErrors =
    | GitNotFoundError
    | TimeoutError
    | GitUnusableError;

export type FromEnvironmentServices = {
    fs: {
        exists: (path: string) => boolean;
    };
    shell: {
        which: (cmd: string, options: { path: string; pathExt?: string, nothrow: true }) => Promise<string|null>;
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
 * Creates git context from environment (e.g. `PATH` and well known locations).
 * This has platform specific behaviours by design.
 */
export async function fromEnvironment(
    cliContext: PersistentCLIContext,
    services: FromEnvironmentServices,
): Promise<Result<GitContext, FromEnvironmentErrors>> {
    const gitBin = isWindows(services.os.platform)
        ? "git.exe"
        : "git";
    let gitPath: string|null|false = await services.shell.which(gitBin, {
        path: services.process.env.PATH ?? "",
        pathExt: services.process.env.PATHEXT ?? undefined,
        nothrow: true,
    });

    if (!gitPath) {
        // Last chance, try common locations
        gitPath = await findGitFromCommonLocations(services);
    }
    
    if (gitPath) {
        return await fromPath(gitPath, cliContext, services);
    }

    return err(createError(ERROR_GIT_NOT_FOUND));
}

type FindGitFromCommonLocationsServices = {
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
 * Searches for git in common locations.
 */
async function findGitFromCommonLocations(services: FindGitFromCommonLocationsServices): Promise<string | false> {
    if (isMacOS(services.os.platform) && services.fs.exists(darwinBuiltinGitPath)) {
        return darwinBuiltinGitPath;
    }

    if (isWindows(services.os.platform)) {
        const env = services.process.env;

        // env:ProgramW6432 -> "C:\Program Files"
        if (env.ProgramW6432) {
            const maybePath = checkGitForWindowsPath(env.ProgramW6432, services);
            if (maybePath) return maybePath;
        }

        // env:ProgramFiles -> "C:\Program Files"
        if (env.ProgramFiles) {
            const maybePath = checkGitForWindowsPath(env.ProgramFiles, services);
            if (maybePath) return maybePath;
        }

        // env:"ProgramFiles(x86)" -> "C:\Program Files (x86)"
        if (env["ProgramFiles(x86)"]) {
            const maybePath = checkGitForWindowsPath(env["ProgramFiles(x86)"], services);
            if (maybePath) return maybePath;
        }

        // env:LocalAppData + "Programs" -> "C:\Users\<username>\AppData\Local\Programs"
        if (env.LocalAppData) {
            const maybePath = checkGitForWindowsPath(env.LocalAppData, services);
            if (maybePath) return maybePath;
        }
    }

    return false;
}

function checkGitForWindowsPath(
    programFilesPath: string,
    services: { fs: { exists: (path: string) => boolean } },
): string | false {
    const maybePath = programFilesPath + "\\Git\\cmd\\git.exe";
    if (services.fs.exists(maybePath)) {
        return maybePath;
    }

    return false;
}
