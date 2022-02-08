import * as cp from "node:child_process";
import * as path from "node:path";
import which from "which";
import { fromPath } from "monolithic-git-interop/cli";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isErr, unwrap } from "monolithic-git-interop/util/result";

export interface IGit {
    path: string;
    version: string;
}

async function findSpecificGit(gitPath: string, onValidate: (path: string) => boolean): Promise<IGit> {
    if (!onValidate(gitPath)) {
        throw new Error("git not found");
    }

    const contextResult = await fromPath(gitPath, {
        env: process.env,
        timeout: 30_000,
    }, createServices());

    if (isErr(contextResult)) {
        throw contextResult;
    }

    return {
        path: gitPath,
        version: unwrap(contextResult).version,
    };
}

async function findGitDarwin(onValidate: (path: string) => boolean): Promise<IGit> {
    const gitPath = await new Promise<string>((c, e) => {
        cp.exec("which git", (err, gitPathBuffer) => {
            if (err) {
                return e("git not found");
            }

            const gitPath = gitPathBuffer.toString().replace(/^\s+|\s+$/g, "");

            if (gitPath !== "/usr/bin/git") {
                c(gitPath);
            }

            // must check if XCode is installed
            cp.exec("xcode-select -p", (err: any) => {
                if (err && err.code === 2) {
                    // git is not installed, and launching /usr/bin/git
                    // will prompt the user to install it

                    return e("git not found");
                }

                c(gitPath);
            });
        });
    });

    return findSpecificGit(gitPath, onValidate);
}

function findSystemGitWin32(base: string, onValidate: (path: string) => boolean): Promise<IGit> {
    if (!base) {
        return Promise.reject<IGit>("Not found");
    }

    return findSpecificGit(path.join(base, "Git", "cmd", "git.exe"), onValidate);
}

/**
 * Throws if git not found on path.
 * @todo Confirm behaviour
 */
async function findGitWin32InPath(onValidate: (path: string) => boolean): Promise<IGit> {
    const gitPath = await which("git.exe");
    return findSpecificGit(gitPath, onValidate);
}

function findGitWin32(onValidate: (path: string) => boolean): Promise<IGit> {
    return findSystemGitWin32(process.env["ProgramW6432"] as string, onValidate)
        .then(undefined, () => findSystemGitWin32(process.env["ProgramFiles(x86)"] as string, onValidate))
        .then(undefined, () => findSystemGitWin32(process.env["ProgramFiles"] as string, onValidate))
        .then(
            undefined,
            () => findSystemGitWin32(path.join(process.env["LocalAppData"] as string, "Programs"), onValidate),
        )
        .then(undefined, () => findGitWin32InPath(onValidate));
}

export async function findGit(hints: string[], onValidate: (path: string) => boolean): Promise<IGit> {
    for (const hint of hints) {
        try {
            return await findSpecificGit(hint, onValidate);
        } catch {
            // noop
        }
    }

    try {
        switch (process.platform) {
            case "darwin":
                return await findGitDarwin(onValidate);
            case "win32":
                return await findGitWin32(onValidate);
            default:
                return await findSpecificGit("git", onValidate);
        }
    } catch {
        // noop
    }

    throw new Error("Git installation not found.");
}
