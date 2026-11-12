import { promises as fs } from "node:fs";

/**
 * Entries in `dotGit` indicating a lock is held or a multi-step operation (rebase, am, merge, cherry-pick, revert,
 * bisect) is in progress, during which background git calls must avoid optional locks or ref writes.
 */
const IN_PROGRESS_ENTRIES = new Set([
    "BISECT_LOG",
    "CHERRY_PICK_HEAD",
    "HEAD.lock",
    "MERGE_HEAD",
    "REVERT_HEAD",
    "index.lock",
    "rebase-apply",
    "rebase-merge",
]);

export async function hasInProgressOperation(dotGit: string): Promise<boolean> {
    try {
        const entries = await fs.readdir(dotGit);
        return entries.some(entry => IN_PROGRESS_ENTRIES.has(entry));
    } catch {
        return false;
    }
}
