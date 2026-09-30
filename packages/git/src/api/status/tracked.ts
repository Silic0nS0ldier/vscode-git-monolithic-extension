import type { GitContext } from "../../cli/context.js";
import { streamToParser } from "../../cli/helpers/stream-to-parser.js";
import type { GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

export type TrackedErrors = GenericError;

export async function tracked(
    git: GitContext,
    cwd: string,
    pathFormat: "relative" | "absolute",
    opts?: { ignoreSubmodules?: boolean },
): Promise<Result<IFileStatus[], TrackedErrors>> {
    if (pathFormat === "absolute") {
        throw new Error("Not implemented");
    }

    const parser = new GitStatusParser();

    const args = ["status", "-z", "--untracked-files=no"];
    if (opts?.ignoreSubmodules) {
        args.push("--ignore-submodules");
    }
    const cliResult = await streamToParser(git, cwd, args, parser);

    if (isErr(cliResult)) {
        return err(unwrap(cliResult));
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

    // Note: `entry.path`, `entry.rename`, and `#lastRaw` are `SlicedString`s
    // (>= 13 chars) that pin their parent chunk while any entry is reachable.
    // With `--untracked-files=no` the output stays small enough for this not
    // to matter; for larger output, wrap the assignments in `detach`. See
    // https://issues.chromium.org/issues/41480525 and `src/helpers/detach.ts`.
    update(raw: string): void {
        let normalisedRaw = raw;
        let i = 0;
        let nextI: number | undefined;

        normalisedRaw = this.#lastRaw + normalisedRaw;

        while ((nextI = this.#parseEntry(normalisedRaw, i)) !== undefined) {
            i = nextI;
        }

        this.#lastRaw = normalisedRaw.slice(i);
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
        if (entry.path.at(-1) !== "/") {
            this.#result.push(entry);
        }

        return lastIndex + 1;
    }
}
