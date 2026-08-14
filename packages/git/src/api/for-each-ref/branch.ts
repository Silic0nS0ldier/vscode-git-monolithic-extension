import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";
import { trySemverCheck } from "../version/mod.js";

/** A single ref's worth of fields; the pattern can only ever match a handful. */
const MAX_BUFFER = 64 * 1024;

/** `%(upstream:track)` arrived in git 1.9.0. */
const AHEAD_BEHIND_SINCE = "1.9.0";

const TRACK = /\[(?:ahead ([0-9]+))?[,\s]*(?:behind ([0-9]+))?]|\[gone]/;

export type UpstreamRef = {
    readonly remote: string;
    readonly name: string;
};

export type BranchDetail =
    | {
        readonly kind: "head";
        readonly name: string;
        readonly commit?: string;
        readonly upstream?: UpstreamRef;
        readonly ahead: number;
        readonly behind: number;
    }
    | {
        readonly kind: "remote-head";
        readonly name: string;
        readonly commit: string;
        readonly remote: string;
    };

function parseLine(line: string, trackable: boolean): BranchDetail | undefined {
    const [refname, upstream, commit, track] = line.trim().split("\0");

    if (refname.startsWith("refs/heads/")) {
        const [, ahead, behind] = (trackable ? TRACK.exec(track ?? "") : null) ?? [];
        const separator = upstream.indexOf("/");

        return {
            ahead: Number(ahead) || 0,
            behind: Number(behind) || 0,
            commit: commit || undefined,
            kind: "head",
            name: refname.substring("refs/heads/".length),
            upstream: upstream
                ? {
                    name: upstream.substring(separator + 1),
                    remote: upstream.substring(0, separator),
                }
                : undefined,
        };
    }

    if (refname.startsWith("refs/remotes/")) {
        const name = refname.substring("refs/remotes/".length);
        const separator = name.indexOf("/");

        return {
            commit,
            kind: "remote-head",
            name: name.substring(separator + 1),
            remote: name.substring(0, separator),
        };
    }

    return undefined;
}

/**
 * Counts the commits either side of `<branch>...<upstream>`.
 * Wraps `git rev-list --left-right --count`.
 */
async function countAheadBehind(
    git: GitContext,
    cwd: string,
    range: string,
): Promise<{ ahead: number; behind: number } | undefined> {
    const result = await readToBuffer(
        { cli: git.cli, cwd },
        ["rev-list", "--left-right", "--count", range],
        MAX_BUFFER,
    );

    if (isErr(result)) {
        return undefined;
    }

    const [ahead, behind] = unwrap(result).toString("utf-8").trim().split("\t");

    return { ahead: Number(ahead) || 0, behind: Number(behind) || 0 };
}

/**
 * Resolves one branch, by short name or by full ref. Returns `undefined` when no ref
 * matches. Wraps `git for-each-ref --format=<fmt> <refs>`.
 */
export async function branch(
    git: GitContext,
    cwd: string,
    name: string,
): Promise<Result<BranchDetail | undefined, ReadToErrors>> {
    const trackable = trySemverCheck(git.version, AHEAD_BEHIND_SINCE);
    const format = trackable
        ? "--format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)"
        : "--format=%(refname)%00%(upstream:short)%00%(objectname)";

    const refs = /^refs\/(head|remotes)\//iu.test(name)
        ? [name]
        : [`refs/heads/${name}`, `refs/remotes/${name}`];

    const result = await readToBuffer({ cli: git.cli, cwd }, ["for-each-ref", format, ...refs], MAX_BUFFER);

    if (isErr(result)) {
        return result;
    }

    const [detail] = unwrap(result).toString("utf-8").trim()
        .split("\n")
        .map(line => parseLine(line, trackable))
        .filter((candidate): candidate is BranchDetail => candidate !== undefined);

    if (detail === undefined) {
        return ok(undefined);
    }

    if (!trackable && detail.kind === "head" && detail.upstream) {
        const counts = await countAheadBehind(
            git,
            cwd,
            `${detail.name}...${detail.upstream.remote}/${detail.upstream.name}`,
        );

        if (counts) {
            return ok({ ...detail, ...counts });
        }
    }

    return ok(detail);
}
