import type { Branch } from "../../api/git.js";
import type { Repository } from "../../git.js";
import { throat } from "../../package-patches/throat.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { pullFrom } from "./pull-from.js";
import type { RunFn } from "./run.js";
import { getUpstreamRemoteAndBranch } from "./upstream.js";

export const pullWithRebase = throat(1, (
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    repository: Repository,
    sourceControlUI: SourceControlUIGroup,
    HEAD: Branch | undefined,
    head: Branch | undefined,
) => {
    const { remote, branch } = getUpstreamRemoteAndBranch(head);

    return pullFrom(run, repoRoot, repository, HEAD, sourceControlUI, true, remote, branch);
});
