import { Branch, Remote } from "../../api/git.js";

export function syncLabel(
    HEAD: Branch | undefined,
    remotes: Remote[],
): string {
    if (
        !HEAD
        || !HEAD.name
        || !HEAD.commit
        || !HEAD.upstream
        || !(HEAD.ahead || HEAD.behind)
    ) {
        return "";
    }

    const remoteName = HEAD && HEAD.remote || HEAD.upstream.remote;
    const remote = remotes.find(r => r.name === remoteName);

    if (remote && remote.isReadOnly) {
        return `${HEAD.behind}↓`;
    }

    return `${HEAD.behind}↓ ${HEAD.ahead}↑`;
}
