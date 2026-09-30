import type { GitContext } from "../../cli/context.js";
import { streamToParser } from "../../cli/helpers/stream-to-parser.js";
import type { GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

export type UntrackedErrors = GenericError;

export async function untracked(
    git: GitContext,
    cwd: string,
    pathFormat: "relative" | "absolute",
): Promise<Result<string[], UntrackedErrors>> {
    if (pathFormat === "absolute") {
        throw new Error("Not implemented");
    }

    const parser = new GitLsFilesParser();

    const args = ["ls-files", "-z", "--others", "--exclude-standard"];
    const cliResult = await streamToParser(git, cwd, args, parser);

    if (isErr(cliResult)) {
        return err(unwrap(cliResult));
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
