import { from_str_radix } from "monolithic-git-wasm";
import type { GitContext } from "../../cli/context.js";
import type { ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC, type GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

const STASH_LINE = /^stash@\{(\d+)\}:(.+)$/;

export type Entry = {
    readonly index: number;
    /** Everything after the `stash@{n}:` marker, leading space included. */
    readonly description: string;
};

/**
 * Lists the stash, newest first.
 * Wraps `git stash list`.
 */
export async function list(
    git: GitContext,
    cwd: string,
): Promise<Result<Entry[], ReadToErrors | GenericError>> {
    const result = await readToString({ cli: git.cli, cwd }, ["stash", "list"]);

    if (isErr(result)) {
        return result;
    }

    const entries: Entry[] = [];
    for (
        const match of unwrap(result).trim().split("\n")
            .filter(line => line.length > 0)
            .map(line => STASH_LINE.exec(line))
            .filter((match): match is RegExpExecArray => match !== null)
    ) {
        const [, index, description] = match;
        try {
            // TODO Descriptions are currently returned with a leading space, it should be removed.
            entries.push({ description, index: from_str_radix(index, 10) });
        } catch (e) {
            return err(createError(ERROR_GENERIC, `Could not parse stash index "${index}": ${e}`));
        }
    }

    return ok(entries);
}
