import type { GitContext } from "../../cli/context.js";
import { streamToParser } from "../../cli/helpers/stream-to-parser.js";
import type { GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { splitInChunks } from "../../helpers/split-in-chunks.js";

export type UntrackedErrors = GenericError;

/**
 * `--literal-pathspecs` is refused alongside any other global pathspec setting, which these inherited variables
 * would supply.
 */
const WITHOUT_GLOBAL_PATHSPEC_SETTINGS = {
    GIT_GLOB_PATHSPECS: undefined,
    GIT_ICASE_PATHSPECS: undefined,
    GIT_NOGLOB_PATHSPECS: undefined,
};

/**
 * Untracked files, each listed individually; an untracked nested repository is listed as one `dir/` entry.
 * Wraps `git ls-files -z --others --exclude-standard`.
 *
 * With `paths`, lists only what is under them, taking each literally rather than as a pattern or pathspec magic.
 * Paths must not overlap, as a long list is split across several invocations. Wraps
 * `git --literal-pathspecs ls-files -z --others --exclude-standard -- <paths>`.
 */
export async function untracked(
    git: GitContext,
    cwd: string,
    pathFormat: "relative" | "absolute",
    opts?: { readonly paths?: readonly string[] },
): Promise<Result<string[], UntrackedErrors>> {
    if (pathFormat === "absolute") {
        throw new Error("Not implemented");
    }

    const parser = new GitLsFilesParser();
    const args = ["ls-files", "-z", "--others", "--exclude-standard"];

    if (opts?.paths === undefined) {
        const cliResult = await streamToParser(git, cwd, args, parser);
        if (isErr(cliResult)) {
            return err(unwrap(cliResult));
        }
        return ok(parser.paths);
    }

    // No chunks for an empty `paths`, so nothing runs: without a pathspec git would list the whole work tree.
    for (const chunk of splitInChunks(opts.paths)) {
        const cliResult = await streamToParser(
            git,
            cwd,
            ["--literal-pathspecs", ...args, "--", ...chunk],
            parser,
            WITHOUT_GLOBAL_PATHSPEC_SETTINGS,
        );
        if (isErr(cliResult)) {
            return err(unwrap(cliResult));
        }
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
