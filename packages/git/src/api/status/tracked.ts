import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises"
import type { GitContext } from "../../cli/context.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { createError, ERROR_GENERIC, type GenericError } from "../../errors.js";

export type UntrackedErrors = GenericError;

export async function tracked(
    git: GitContext,
    cwd: string,
    pathFormat: "relative"|"absolute",
    opts?: { ignoreSubmodules?: boolean },
): Promise<Result<IFileStatus[], UntrackedErrors>> {
    if (pathFormat === "absolute") {
        throw new Error("Not implemented");
    }

    const parser = new GitStatusParser();
    const stdout = new PassThrough();
    stdout.on("data", (chunk: string) => {
        parser.update(chunk);
    });

    const args = ["status", "-z", "--untracked-files=no"];
    if (opts?.ignoreSubmodules) {
        args.push("--ignore-submodules");
    }
    const cliAction = git.cli({ cwd, stdout }, args);

    const [cliResult] = await Promise.all([cliAction, finished(stdout)]);

    if (isErr(cliResult)) {
        return err(createError(ERROR_GENERIC, unwrap(cliResult)));
    }

    return ok(parser.status);
}

export interface IFileStatus {
    x: string;
    y: string;
    path: string;
    rename?: string;
}

class GitStatusParser {
    #lastRaw = "";
    #result: IFileStatus[] = [];

    get status(): IFileStatus[] {
        return this.#result;
    }

    update(raw: string): void {
        let normalisedRaw = raw;
        let i = 0;
        let nextI: number | undefined;

        normalisedRaw = this.#lastRaw + normalisedRaw;

        while ((nextI = this.#parseEntry(normalisedRaw, i)) !== undefined) {
            i = nextI;
        }

        this.#lastRaw = normalisedRaw.substr(i);
    }

    #parseEntry(raw: string, start: number): number | undefined {
        let i = start;
        if (i + 4 >= raw.length) {
            return;
        }

        let lastIndex: number;
        const entry: IFileStatus = {
            path: "",
            rename: undefined,
            x: raw.charAt(i++),
            y: raw.charAt(i++),
        };

        // space
        i++;

        if (entry.x === "R" || entry.x === "C") {
            lastIndex = raw.indexOf("\0", i);

            if (lastIndex === -1) {
                return;
            }

            entry.rename = raw.substring(i, lastIndex);
            i = lastIndex + 1;
        }

        lastIndex = raw.indexOf("\0", i);

        if (lastIndex === -1) {
            return;
        }

        entry.path = raw.substring(i, lastIndex);

        // If path ends with slash, it must be a nested git repo
        if (entry.path[entry.path.length - 1] !== "/") {
            this.#result.push(entry);
        }

        return lastIndex + 1;
    }
}
