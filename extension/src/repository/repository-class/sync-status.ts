import type { Branch, Remote } from "../../api/git.js";

/**
 * A HEAD `Branch` that is known to have a configured upstream and a non-zero
 * ahead/behind count.
 */
export type UnsyncedBranch = Branch & { upstream: NonNullable<Branch["upstream"]> };

function isUnsyncedBranch(HEAD: Branch | undefined): HEAD is UnsyncedBranch {
    return !!HEAD
        && !!HEAD.name
        && !!HEAD.commit
        && !!HEAD.upstream
        && !!(HEAD.ahead || HEAD.behind);
}

/**
 * Resolves the current sync status. Returns `undefined` when HEAD has no
 * upstream or is fully synced (no ahead/behind counts), otherwise returns the
 * head branch together with the upstream remote (if it is registered).
 */
export function getSyncStatus(
    HEAD: Branch | undefined,
    remotes: Remote[],
): { HEAD: UnsyncedBranch; remote: Remote | undefined } | undefined {
    if (!isUnsyncedBranch(HEAD)) {
        return undefined;
    }

    const remoteName = HEAD.remote || HEAD.upstream.remote;
    const remote = remotes.find(r => r.name === remoteName);

    return { HEAD, remote };
}
