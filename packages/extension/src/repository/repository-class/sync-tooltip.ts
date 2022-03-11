import type { Branch, Remote } from "../../api/git.js";
import { localize } from "../../util.js";

export function syncTooltip(
    HEAD: Branch | undefined,
    remotes: Remote[],
) {
    if (
        !HEAD
        || !HEAD.name
        || !HEAD.commit
        || !HEAD.upstream
        || !(HEAD.ahead || HEAD.behind)
    ) {
        return localize("sync changes", "Synchronize Changes");
    }

    const remoteName = HEAD && HEAD.remote || HEAD.upstream.remote;
    const remote = remotes.find(r => r.name === remoteName);

    if ((remote && remote.isReadOnly) || !HEAD.ahead) {
        return localize(
            "pull n",
            "Pull {0} commits from {1}/{2}",
            HEAD.behind,
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
    } else if (!HEAD.behind) {
        return localize(
            "push n",
            "Push {0} commits to {1}/{2}",
            HEAD.ahead,
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
    } else {
        return localize(
            "pull push n",
            "Pull {0} and push {1} commits between {2}/{3}",
            HEAD.behind,
            HEAD.ahead,
            HEAD.upstream.remote,
            HEAD.upstream.name,
        );
    }
}
