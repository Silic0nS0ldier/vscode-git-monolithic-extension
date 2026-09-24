import { upstreams } from "monolithic-git-interop/api/for-each-ref/upstreams";
import { head as symbolicRefHead } from "monolithic-git-interop/api/symbolic-ref/head";
import { remoteHead } from "monolithic-git-interop/api/symbolic-ref/remote-head";
import type { GitContext } from "monolithic-git-interop/cli";
import { unwrapOk } from "monolithic-git-interop/errors";
import { isOk, unwrap } from "monolithic-git-interop/util/result";

export type UpstreamScope =
    /** Every branch a local branch tracks. */
    | "tracked"
    /** The remote's default branch, and whatever the current branch tracks. */
    | "mainAndCurrent";

/** Git fetches from here when the current branch names no remote of its own. */
const DEFAULT_REMOTE = "origin";

/** The refs to fetch for `scope`, grouped by the remote that has them. */
export async function upstreamFetchTargets(
    context: GitContext,
    repoRoot: string,
    scope: UpstreamScope,
): Promise<Map<string, Set<string>>> {
    const targets = new Map<string, Set<string>>();
    const add = (remote: string, ref: string): void => {
        const refs = targets.get(remote) ?? new Set();
        refs.add(ref);
        targets.set(remote, refs);
    };

    if (scope === "tracked") {
        for (const upstream of unwrapOk(await upstreams(context, repoRoot))) {
            if (!upstream.gone) {
                add(upstream.remote, upstream.ref);
            }
        }
        return targets;
    }

    const headResult = await symbolicRefHead(context, repoRoot);
    const branch = isOk(headResult) ? unwrap(headResult) : undefined;
    const current = branch === undefined
        ? undefined
        : unwrapOk(await upstreams(context, repoRoot, [`refs/heads/${branch}`]))
            .find(upstream => upstream.branch === branch);

    if (current !== undefined && !current.gone) {
        add(current.remote, current.ref);
    }

    const remote = current?.remote ?? DEFAULT_REMOTE;
    const main = unwrapOk(await remoteHead(context, repoRoot, remote));

    if (main !== undefined) {
        add(remote, main);
    }

    return targets;
}
