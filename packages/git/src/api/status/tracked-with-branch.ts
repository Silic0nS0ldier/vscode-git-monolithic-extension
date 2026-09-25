import { from_str_radix } from "monolithic-git-wasm";
import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import type { GitContext } from "../../cli/context.js";
import { createError, ERROR_GENERIC, type GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { trySemverCheck } from "../version/mod.js";
import type { IFileStatus } from "./tracked.js";

/** `--porcelain=v2` arrived in git 2.11.0. */
const PORCELAIN_V2_SINCE = "2.11.0";

export type TrackedWithBranchErrors = GenericError;

export type HeadStatus = {
    /** Undefined while HEAD is detached. */
    readonly name?: string;
    /** Undefined before the first commit. */
    readonly commit?: string;
    readonly upstream?: { readonly remote: string; readonly name: string };
    /** Undefined without an upstream, or once the upstream is gone. */
    readonly ahead?: number;
    readonly behind?: number;
};

export type TrackedWithBranch = {
    readonly head: HeadStatus;
    readonly files: IFileStatus[];
};

/** Whether `trackedWithBranch` can run against this git. */
export function supportsTrackedWithBranch(git: GitContext): boolean {
    return trySemverCheck(git.version, PORCELAIN_V2_SINCE);
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
    const parser = new PorcelainV2Parser();
    const stdout = new PassThrough();
    stdout.on("data", (chunk: string) => {
        parser.update(chunk);
    });

    const args = ["status", "-z", "--porcelain=v2", "--branch", "--untracked-files=no"];
    if (opts?.ignoreSubmodules) {
        args.push("--ignore-submodules");
    }
    const cliAction = git.cli({ cwd, stdout }, args);

    const [cliResult] = await Promise.all([cliAction, finished(stdout)]);

    if (isErr(cliResult)) {
        return err(createError(ERROR_GENERIC, unwrap(cliResult)));
    }

    return parser.result();
}

/** Space-separated fields ahead of the path, by entry type. */
const FIELDS_BEFORE_PATH: Record<string, number> = { "1": 8, "2": 9, "u": 10 };

/** Porcelain v2 marks an unchanged side with `.`, where v1 (and `IFileStatus`) use a space. */
function statusChar(char: string): string {
    return char === "." ? " " : char;
}

function parseCount(raw: string): number | undefined {
    try {
        return from_str_radix(raw, 10);
    } catch {
        return undefined;
    }
}

class PorcelainV2Parser {
    #pending = "";
    #files: IFileStatus[] = [];
    #oid?: string;
    #head?: string;
    #upstream?: string;
    #ahead?: number;
    #behind?: number;
    #invalid?: string;

    update(chunk: string): void {
        const raw = this.#pending + chunk;
        let start = 0;

        while (true) {
            const end = raw.indexOf("\0", start);
            if (end === -1) {
                break;
            }

            const record = raw.substring(start, end);

            // A rename or copy carries its original path as a second record.
            if (record.startsWith("2 ")) {
                const origEnd = raw.indexOf("\0", end + 1);
                if (origEnd === -1) {
                    break;
                }
                this.#parseEntry(record, raw.substring(end + 1, origEnd));
                start = origEnd + 1;
                continue;
            }

            this.#parseRecord(record);
            start = end + 1;
        }

        this.#pending = raw.slice(start);
    }

    result(): Result<TrackedWithBranch, TrackedWithBranchErrors> {
        if (this.#invalid !== undefined) {
            return err(createError(ERROR_GENERIC, `Unexpected git status output: ${this.#invalid}`));
        }

        const separator = this.#upstream?.indexOf("/") ?? -1;
        const head: HeadStatus = {
            ahead: this.#ahead,
            behind: this.#behind,
            commit: this.#oid === "(initial)" ? undefined : this.#oid,
            name: this.#head === "(detached)" ? undefined : this.#head,
            upstream: this.#upstream
                ? { name: this.#upstream.substring(separator + 1), remote: this.#upstream.substring(0, separator) }
                : undefined,
        };

        return ok({ files: this.#files, head });
    }

    #parseRecord(record: string): void {
        if (record.startsWith("# ")) {
            this.#parseHeader(record.substring(2));
        } else if (record.startsWith("1 ") || record.startsWith("u ")) {
            this.#parseEntry(record, undefined);
        } else if (record !== "") {
            // Untracked and ignored entries are not requested, so anything else is unexpected.
            this.#invalid ??= record;
        }
    }

    #parseHeader(header: string): void {
        const space = header.indexOf(" ");
        const key = header.substring(0, space);
        const value = header.substring(space + 1);

        switch (key) {
            case "branch.oid":
                this.#oid = value;
                break;
            case "branch.head":
                this.#head = value;
                break;
            case "branch.upstream":
                this.#upstream = value;
                break;
            case "branch.ab": {
                const [ahead, behind] = value.split(" ");
                this.#ahead = ahead?.startsWith("+") ? parseCount(ahead.substring(1)) : undefined;
                this.#behind = behind?.startsWith("-") ? parseCount(behind.substring(1)) : undefined;
                if (this.#ahead === undefined || this.#behind === undefined) {
                    this.#invalid ??= header;
                }
                break;
            }
        }
    }

    #parseEntry(record: string, origPath: string | undefined): void {
        let pathStart = 0;
        for (let field = FIELDS_BEFORE_PATH[record.charAt(0)]!; field > 0; field--) {
            pathStart = record.indexOf(" ", pathStart) + 1;
            if (pathStart === 0) {
                this.#invalid ??= record;
                return;
            }
        }

        const path = record.substring(pathStart);

        // A path ending in a slash is a nested repository, which `tracked` also leaves out.
        if (path.at(-1) === "/") {
            return;
        }

        const x = statusChar(record.charAt(2));
        const y = statusChar(record.charAt(3));

        // `IFileStatus` keeps the original path in `path` and the new one in `rename`.
        this.#files.push(
            origPath === undefined
                ? { path, rename: undefined, x, y }
                : { path: origPath, rename: path, x, y },
        );
    }
}
