import type { Branch } from "../../api/git.js";
import type { Repository } from "../../git.js";
import { throat } from "../../package-patches/throat.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { pullFrom } from "./pull-from.js";
import type { RunFn } from "./run.js";
import { getUpstreamRemoteAndBranch } from "./upstream.js";

export const pull = throat(1, (
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    repository: Repository,
    HEAD: Branch | undefined,
    sourceControlUI: SourceControlUIGroup,
    head?: Branch,
    unshallow?: boolean,
) => {
    const { remote, branch } = getUpstreamRemoteAndBranch(head);

    return pullFrom(run, repoRoot, repository, HEAD, sourceControlUI, false, remote, branch, unshallow);
});
