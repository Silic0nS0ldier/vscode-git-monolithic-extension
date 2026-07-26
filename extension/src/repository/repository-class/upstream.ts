import type { Branch } from "../../api/git.js";

/**
 * Extracts the upstream `{ remote, branch }` pair from the given branch, or
 * `{ undefined, undefined }` when the branch has no complete upstream info.
 */
export function getUpstreamRemoteAndBranch(
    head: Branch | undefined,
): { remote: string | undefined; branch: string | undefined } {
    if (head && head.name && head.upstream) {
        return { branch: `${head.upstream.name}`, remote: head.upstream.remote };
    }
    return { branch: undefined, remote: undefined };
}
