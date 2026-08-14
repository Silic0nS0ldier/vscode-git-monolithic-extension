import type { GitContext } from "../../cli/context.js";
import type { ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

const CHERRY_LINE = /^([=+])\s+(\S+)\s+(.*)$/;

export type CherryStatus = "equivalent" | "unique";

export type CherryEntry = {
    readonly status: CherryStatus;
    readonly hash: string;
    readonly subject: string;
};

/**
 * Lists commits reachable only from the right side of `range`, each marked according to
 * whether an equivalent patch exists on the left side.
 * Wraps `git log --oneline --cherry <range> --`.
 */
export async function cherry(
    git: GitContext,
    cwd: string,
    range: string,
): Promise<Result<CherryEntry[], ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["log", "--oneline", "--cherry", range, "--"]);

    if (isErr(result)) {
        return result;
    }

    const data = unwrap(result).trim();
    if (data === "") {
        return ok([]);
    }

    const entries = data.split("\n")
        .map(line => CHERRY_LINE.exec(line))
        .filter((match): match is RegExpExecArray => match !== null)
        .map(([, marker, hash, subject]) => ({
            hash,
            status: marker === "=" ? "equivalent" as const : "unique" as const,
            subject,
        }));

    return ok(entries);
}
