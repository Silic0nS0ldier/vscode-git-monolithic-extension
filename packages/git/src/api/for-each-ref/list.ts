import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { isErr, ok, type Result, unwrap } from "../../func-result.js";

/** 4 MiB — room for tens of thousands of refs. */
const MAX_BUFFER = 4 * 1024 * 1024;

/** The namespaces this module knows how to parse. */
const DEFAULT_PATTERNS = ["refs/heads", "refs/remotes", "refs/tags"];

const FORMAT = "%(refname) %(objectname) %(*objectname)";

// TODO Match SHA-256 object names too. At 64 characters they fail every pattern below, so a
// repository using that hash reports no refs at all.
const HEAD_LINE = /^refs\/heads\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/;
const REMOTE_HEAD_LINE = /^refs\/remotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/;
const TAG_LINE = /^refs\/tags\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/;

export type RefKind = "head" | "remote-head" | "tag";

export type Ref = {
    readonly kind: RefKind;
    readonly name: string;
    readonly commit: string;
    /** Only set for `remote-head` refs. */
    readonly remote?: string;
};

export type ListOptions = {
    /** Newest first. Omitted, git orders by refname. */
    readonly sort?: "committerdate";
    /** Restricts the listing to refs whose tip has this commit as an ancestor. */
    readonly contains?: string;
    /** Listed instead of the default namespaces. */
    readonly pattern?: string;
    readonly count?: number;
};

function parseLine(line: string): Ref | undefined {
    let match: RegExpExecArray | null;

    if ((match = HEAD_LINE.exec(line)) !== null) {
        return { commit: match[2], kind: "head", name: match[1] };
    }

    if ((match = REMOTE_HEAD_LINE.exec(line)) !== null) {
        return { commit: match[3], kind: "remote-head", name: `${match[1]}/${match[2]}`, remote: match[1] };
    }

    if ((match = TAG_LINE.exec(line)) !== null) {
        // An annotated tag reports the tag object as `%(objectname)`, so the commit is only
        // available through the dereferenced `%(*objectname)`.
        return { commit: match[3] ?? match[2], kind: "tag", name: match[1] };
    }

    return undefined;
}

/**
 * Lists branches, remote branches and tags.
 * Wraps `git for-each-ref --format=<fmt> [patterns]`.
 */
export async function list(
    git: GitContext,
    cwd: string,
    opts: ListOptions = {},
): Promise<Result<Ref[], ReadToErrors>> {
    const args = ["for-each-ref"];

    if (opts.count) {
        args.push(`--count=${opts.count}`);
    }

    if (opts.sort) {
        args.push("--sort", `-${opts.sort}`);
    }

    args.push("--format", FORMAT, ...(opts.pattern ? [opts.pattern] : DEFAULT_PATTERNS));

    if (opts.contains) {
        args.push("--contains", opts.contains);
    }

    const result = await readToBuffer({ cli: git.cli, cwd }, args, MAX_BUFFER);

    if (isErr(result)) {
        return result;
    }

    const refs = unwrap(result).toString("utf-8")
        .split("\n")
        .filter(line => line.length > 0)
        .map(parseLine)
        .filter((ref): ref is Ref => ref !== undefined);

    return ok(refs);
}
