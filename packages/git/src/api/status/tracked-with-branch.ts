import type { GitContext } from "../../cli/context.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";
import { type HeadStatus, status, type StatusErrors, supportsStatus } from "./mod.js";
import type { IFileStatus } from "./tracked.js";

export type { HeadStatus };

export type TrackedWithBranchErrors = StatusErrors;

export type TrackedWithBranch = {
    readonly head: HeadStatus;
    readonly files: IFileStatus[];
};

/** Whether `trackedWithBranch` can run against this git. */
export function supportsTrackedWithBranch(git: GitContext): boolean {
    return supportsStatus(git);
}

/**
 * Changes to tracked files, as `tracked` reports them, along with HEAD and its upstream,
 * from a single git invocation. Wraps `git status -z --porcelain=v2 --branch --untracked-files=no`.
 */
export async function trackedWithBranch(
    git: GitContext,
    cwd: string,
    opts?: { ignoreSubmodules?: boolean },
): Promise<Result<TrackedWithBranch, TrackedWithBranchErrors>> {
    const result = await status(git, cwd, { ignoreSubmodules: opts?.ignoreSubmodules, untracked: "no" });
    if (isErr(result)) {
        return result;
    }

    const { files, head } = unwrap(result);
    return ok({ files, head });
}
