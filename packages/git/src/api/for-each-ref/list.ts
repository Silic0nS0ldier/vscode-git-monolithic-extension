import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import type { CLIErrors, GitContext } from "../../cli/context.js";
import { isErr, ok, type Result } from "../../func-result.js";

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
    /** Restricts the listing to refs pointing at this commit. */
    readonly pointsAt?: string;
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

export type ListErrors = CLIErrors;

type RefParser = {
    /** Parses every complete line in `chunk`, holding any remainder for the next call. */
    update(chunk: string): void;
    /** Flushes a final line that git emitted without a trailing break. */
    end(): Ref[];
};

function createRefParser(): RefParser {
    const refs: Ref[] = [];
    /** The tail of the last chunk, up to the line break that has yet to arrive. */
    let partial = "";

    function push(line: string): void {
        const ref = parseLine(line);
        if (ref !== undefined) {
            refs.push(ref);
        }
    }

    return {
        end(): Ref[] {
            push(partial);
            partial = "";
            return refs;
        },
        update(chunk: string): void {
            const raw = partial + chunk;
            let start = 0;
            let end: number;

            while ((end = raw.indexOf("\n", start)) !== -1) {
                push(raw.slice(start, end));
                start = end + 1;
            }

            partial = raw.slice(start);
        },
    };
}

/**
 * Lists branches, remote branches and tags.
 * Wraps `git for-each-ref --format=<fmt> [patterns]`.
 */
export async function list(
    git: GitContext,
    cwd: string,
    opts: ListOptions = {},
): Promise<Result<Ref[], ListErrors>> {
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

    if (opts.pointsAt) {
        args.push("--points-at", opts.pointsAt);
    }

    const parser = createRefParser();
    const stdout = new PassThrough({ encoding: "utf-8" });
    stdout.on("data", (chunk: string) => parser.update(chunk));

    const cliResult = await git.cli({ cwd, stdout }, args);

    if (isErr(cliResult)) {
        return cliResult;
    }

    await finished(stdout);

    return ok(parser.end());
}
