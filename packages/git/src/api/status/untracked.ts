import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import type { GitContext } from "../../cli/context.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { createError, ERROR_GENERIC, type GenericError } from "../../errors.js";

export type UntrackedErrors = GenericError;

export async function untracked(
    git: GitContext,
    cwd: string,
    pathFormat: "relative"|"absolute",
): Promise<Result<string[], UntrackedErrors>> {
    if (pathFormat === "absolute") {
        throw new Error("Not implemented");
    }

    const parser = new GitLsFilesParser();
    const stdout = new PassThrough();
    stdout.on("data", (chunk: string) => {
        parser.update(chunk);
    });

    const args = ["ls-files", "-z", "--others", "--exclude-standard"];
    const cliAction = git.cli({ cwd, stdout }, args);

    const [cliResult] = await Promise.all([cliAction, finished(stdout)]);

    if (isErr(cliResult)) {
        return err(createError(ERROR_GENERIC, unwrap(cliResult)));
    }

    return ok(parser.paths);
}

class GitLsFilesParser {
    #lastRaw = "";
    #result: string[] = [];

    get paths(): string[] {
        return this.#result;
    }

    update(raw: string): void {
        let normalisedRaw = raw;
        let i = 0;
        let nextI: number | undefined;

        normalisedRaw = this.#lastRaw + normalisedRaw;

        while ((nextI = normalisedRaw.indexOf("\0", i)) !== -1) {
            const path = normalisedRaw.slice(i, nextI);
            this.#result.push(path);
            i = nextI + 1;
        }

        this.#lastRaw = normalisedRaw.slice(i);
    }
}
