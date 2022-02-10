import { ERROR_GIT_NOT_FOUND, GitNotFoundError, GitUnusableError, TimeoutError } from "../errors.js";
import { err, Result } from "../func-result.js";
import { GitContext, PersistentCLIContext } from "./context.js";
import { SpawnFn } from "./create.js";
import { darwinBuiltinGitPath, fromPath } from "./from-path.js";

export type FromEnvironmentErrors =
    | GitNotFoundError
    | TimeoutError
    | GitUnusableError<unknown>;

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
    os: {
        platform: "darwin" | "win32" | string;
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
    try {
        const gitBin = services.os.platform === "windows"
            ? "git.exe"
            : "git";
        // TODO Fix types in DT so we can use nothrow
        const gitPath = await services.shell.which(gitBin, {
            path: services.process.env.path ?? "",
            pathExt: services.process.env.pathExt ?? "",
        });
        return await fromPath(gitPath, cliContext, services);
    } catch {
        // Last chance, try common locations
        const gitPath = await findGitFromCommonLocations(services);
        if (gitPath) {
            return await fromPath(gitPath, cliContext, services);
        }

        return err({ type: ERROR_GIT_NOT_FOUND });
    }
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
        platform: "darwin" | "win32" | string;
    };
};

/**
 * Searches for git in common locations.
 */
async function findGitFromCommonLocations(services: FindGitFromCommonLocationsServices): Promise<string | false> {
    switch (services.os.platform) {
        case "darwin": {
            if (services.fs.exists(darwinBuiltinGitPath)) {
                return darwinBuiltinGitPath;
            }
        }
        case "win32": {
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
        default:
            return false;
    }
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
