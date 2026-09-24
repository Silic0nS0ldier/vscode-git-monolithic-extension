import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";
import { detach } from "../../helpers/detach.js";

/** Tens of thousands of branches at a couple of hundred bytes a line. */
const MAX_BUFFER = 16 * 1024 * 1024;

/** `%(upstream:remotename)` and `%(upstream:remoteref)` need git 2.16. */
const FORMAT = "--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(upstream:track)";

/** Git's name for the local repository when a branch tracks another local branch. */
const LOCAL_REMOTE = ".";

export type Upstream = {
    /** The local branch, without `refs/heads/`. */
    readonly branch: string;
    readonly remote: string;
    /** The tracked ref as the remote names it, e.g. `refs/heads/main`. */
    readonly ref: string;
    /** The tracking ref is gone, as it is once a fetch prunes a branch the remote dropped. */
    readonly gone: boolean;
};

function parseLine(line: string): Upstream | undefined {
    const [refname, remote, ref, track] = line.split("\0");

    if (!refname?.startsWith("refs/heads/") || !remote || remote === LOCAL_REMOTE || !ref) {
        return undefined;
    }

    return {
        branch: detach(refname.substring("refs/heads/".length)),
        gone: track === "[gone]",
        ref: detach(ref),
        remote: detach(remote),
    };
}

/**
 * Lists the local branches that track a branch on a remote, and what they track.
 * Wraps `git for-each-ref --format=<fmt> [patterns]`.
 *
 * @param patterns Branches to consider. A pattern also matches every branch nested under it.
 */
export async function upstreams(
    git: GitContext,
    cwd: string,
    patterns: readonly string[] = ["refs/heads"],
): Promise<Result<Upstream[], ReadToErrors>> {
    const result = await readToBuffer({ cli: git.cli, cwd }, ["for-each-ref", FORMAT, ...patterns], MAX_BUFFER);

    if (isErr(result)) {
        return result;
    }

    return ok(
        unwrap(result).toString("utf-8")
            .split("\n")
            .map(parseLine)
            .filter((upstream): upstream is Upstream => upstream !== undefined),
    );
}
