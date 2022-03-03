import * as path from "node:path";
import { Uri } from "vscode";
import { Change, Status } from "../../api/git.js";
import { SpawnOptions } from "../SpawnOptions.js";
import { sanitizePath } from "../helpers.js";
import { IExecutionResult } from "../exec.js";

type Exec = (args: string[], options?: SpawnOptions) => Promise<IExecutionResult<string>>;

async function diffFiles(
    {
        exec,
        repositoryRoot,
    }: {
        exec: Exec;
        repositoryRoot: string;
    },
    cached: boolean,
    ref?: string,
): Promise<Change[]> {
    const args = ["diff", "--name-status", "-z", "--diff-filter=ADMR"];
    if (cached) {
        args.push("--cached");
    }

    if (ref) {
        args.push(ref);
    }

    const gitResult = await exec(args);
    if (gitResult.exitCode) {
        return [];
    }

    const entries = gitResult.stdout.split("\x00");
    let index = 0;
    const result: Change[] = [];

    entriesLoop:
    while (index < entries.length - 1) {
        const change = entries[index++];
        const resourcePath = entries[index++];
        if (!change || !resourcePath) {
            break;
        }

        const originalUri = Uri.file(
            path.isAbsolute(resourcePath) ? resourcePath : path.join(repositoryRoot, resourcePath),
        );
        let status: Status = Status.UNTRACKED;

        // Copy or Rename status comes with a number, e.g. 'R100'. We don't need the number, so we use only first character of the status.
        switch (change[0]) {
            case "M":
                status = Status.MODIFIED;
                break;

            case "A":
                status = Status.INDEX_ADDED;
                break;

            case "D":
                status = Status.DELETED;
                break;

            // Rename contains two paths, the second one is what the file is renamed/copied to.

            case "R":
                if (index >= entries.length) {
                    break;
                }

                const newPath = entries[index++];
                if (!newPath) {
                    break;
                }

                const uri = Uri.file(path.isAbsolute(newPath) ? newPath : path.join(repositoryRoot, newPath));
                result.push({
                    originalUri,
                    renameUri: uri,
                    status: Status.INDEX_RENAMED,
                    uri,
                });

                continue;

            default:
                // Unknown status
                // TODO Log
                break entriesLoop;
        }

        result.push({
            originalUri,
            renameUri: originalUri,
            status,
            uri: originalUri,
        });
    }

    return result;
}

export async function diffWithHEAD(
    {
        exec,
        repositoryRoot,
    }: {
        exec: Exec;
        repositoryRoot: string;
    },
    path?: string | undefined,
): Promise<string | Change[]> {
    if (!path) {
        return await diffFiles({ exec, repositoryRoot }, false);
    }

    const args = ["diff", "--", sanitizePath(path)];
    const result = await exec(args);
    return result.stdout;
}

export async function diffWith(
    {
        exec,
        repositoryRoot,
    }: {
        exec: Exec;
        repositoryRoot: string;
    },
    ref: string,
    path?: string,
): Promise<string | Change[]> {
    if (!path) {
        return await diffFiles({ exec, repositoryRoot }, false, ref);
    }

    const args = ["diff", ref, "--", sanitizePath(path)];
    const result = await exec(args);
    return result.stdout;
}

export async function diffIndexWithHEAD(
    {
        exec,
        repositoryRoot,
    }: {
        exec: Exec;
        repositoryRoot: string;
    },
    path?: string,
): Promise<string | Change[]> {
    if (!path) {
        return await diffFiles({ exec, repositoryRoot }, true);
    }

    const args = ["diff", "--cached", "--", sanitizePath(path)];
    const result = await exec(args);
    return result.stdout;
}

export async function diffIndexWith(
    {
        exec,
        repositoryRoot,
    }: {
        exec: Exec;
        repositoryRoot: string;
    },
    ref: string,
    path?: string,
): Promise<string | Change[]> {
    if (!path) {
        return await diffFiles({ exec, repositoryRoot }, true, ref);
    }

    const args = ["diff", "--cached", ref, "--", sanitizePath(path)];
    const result = await exec(args);
    return result.stdout;
}

export async function diffBetween(
    {
        exec,
        repositoryRoot,
    }: {
        exec: Exec;
        repositoryRoot: string;
    },
    ref1: string,
    ref2: string,
    path?: string,
): Promise<string | Change[]> {
    const range = `${ref1}...${ref2}`;
    if (!path) {
        return await diffFiles({ exec, repositoryRoot }, false, range);
    }

    const args = ["diff", range, "--", sanitizePath(path)];
    const result = await exec(args);

    return result.stdout.trim();
}
