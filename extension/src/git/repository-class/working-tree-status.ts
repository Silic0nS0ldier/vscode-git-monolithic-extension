import type { StatusOptions } from "monolithic-git-interop/api/status/mod";
import type { IFileStatus } from "monolithic-git-interop/api/status/tracked";

/** The config that decides how `readWorkingTreeStatus` calls `git status`. */
export const STATUS_CONFIG_KEYS = ["status.showUntrackedFiles", "diff.ignoreSubmodules"] as const;

export type StatusConfig = Record<(typeof STATUS_CONFIG_KEYS)[number], string | undefined>;

/** Untracked files, or why they could not be listed. Never rejects, as it is awaited after other work. */
export type UntrackedOutcome = Promise<{ files: string[] } | { reason: unknown }>;

export type WorkingTreeStatus<THead> = {
    readonly status: IFileStatus[];
    readonly head: THead;
    readonly untracked: UntrackedOutcome;
};

export type WorkingTreeStatusDeps<THead> = {
    readonly config: () => Promise<StatusConfig>;
    readonly optionalLocks?: () => Promise<boolean>;
    readonly status: (opts: StatusOptions) => Promise<{ status: IFileStatus[]; head: THead; untracked: string[] }>;
    readonly expand: (folders: string[]) => Promise<string[]>;
};

/**
 * Picks the `git status` call git's untracked cache can serve, which matches the tracked changes `-uno` lists.
 * Both values are compared exactly, as git compares them.
 */
export function statusOptions(config: StatusConfig, ignoreSubmodules: boolean, optionalLocks = true): StatusOptions {
    const diffIgnoreSubmodules = config["diff.ignoreSubmodules"];
    return {
        // The cache only serves `all` when it is the configured mode.
        untracked: config["status.showUntrackedFiles"] === "all" ? "all" : "normal",
        ignoreSubmodules,
        // A user's own `untracked`, `dirty` or `all` already hides at least what `-uno` did.
        hideUntrackedInSubmodules: diffIgnoreSubmodules === undefined || diffIgnoreSubmodules === "none",
        ...(optionalLocks ? {} : { optionalLocks: false }),
    };
}

/**
 * Tracked changes and HEAD from one `git status`, then its untracked files listed one by one. Two `git status`
 * running at once can each rewrite the index from a stale read, losing the other's untracked cache update, so this
 * makes exactly one call. In `normal` mode each collapsed `dir/` entry is listed through `expand`; anything
 * `expand` still lists as `dir/` is a nested repository.
 */
export async function readWorkingTreeStatus<THead>(
    deps: WorkingTreeStatusDeps<THead>,
    ignoreSubmodules: boolean,
): Promise<WorkingTreeStatus<THead>> {
    const [config, optionalLocks] = await Promise.all([
        deps.config(),
        deps.optionalLocks?.() ?? true,
    ]);
    const opts = statusOptions(config, ignoreSubmodules, optionalLocks);
    const { head, status, untracked } = await deps.status(opts);

    const files: string[] = [];
    const folders: string[] = [];
    for (const entry of untracked) {
        (opts.untracked === "normal" && entry.endsWith("/") ? folders : files).push(entry);
    }

    const listed = folders.length === 0
        ? Promise.resolve(files)
        : deps.expand(folders).then(expanded => [...files, ...expanded]);

    return {
        head,
        status,
        untracked: listed.then(all => ({ files: all }), (reason: unknown) => ({ reason })),
    };
}
