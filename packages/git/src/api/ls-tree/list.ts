import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

export type LsTreeEntry = {
    mode: string;
    type: string;
    object: string;
    size: string;
    file: string;
};

/**
 * Lists the contents of a tree object for a given path.
 * Wraps `git ls-tree -l <treeish> -- <filePath>`.
 */
export async function lsTree(
    git: GitContext,
    cwd: string,
    treeish: string,
    filePath: string,
): Promise<Result<LsTreeEntry[], ReadToErrors>> {
    const result = await readToString(
        { cli: git.cli, cwd },
        ["ls-tree", "-l", treeish, "--", filePath],
    );

    if (isErr(result)) {
        return result;
    }

    const raw = unwrap(result);
    const entries = raw
        .split("\n")
        .filter(l => l.length > 0)
        .map(line => /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
        .map(([, mode, type, object, size, file]) => ({ file, mode, object, size, type }));

    return ok(entries);
}
