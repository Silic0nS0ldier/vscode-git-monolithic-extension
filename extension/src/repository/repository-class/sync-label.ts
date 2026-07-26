import type { Branch, Remote } from "../../api/git.js";
import { getSyncStatus } from "./sync-status.js";

export function syncLabel(
    HEAD: Branch | undefined,
    remotes: Remote[],
): string {
    const status = getSyncStatus(HEAD, remotes);

    if (!status) {
        return "";
    }

    if (status.remote && status.remote.isReadOnly) {
        return `${status.HEAD.behind}↓`;
    }

    return `${status.HEAD.behind}↓ ${status.HEAD.ahead}↑`;
}
