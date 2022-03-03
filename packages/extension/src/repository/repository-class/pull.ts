import { Branch } from "../../api/git.js";
import { Repository } from "../../git.js";
import { throat } from "../../package-patches/throat.js";
import { GitResourceGroup } from "../GitResourceGroup.js";
import { pullFrom } from "./pull-from.js";
import { RunFn } from "./run.js";

export const pull = throat(1, (
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    repository: Repository,
    HEAD: Branch | undefined,
    workingTreeGroup: GitResourceGroup,
    head?: Branch,
    unshallow?: boolean,
) => {
    let remote: string | undefined;
    let branch: string | undefined;

    if (head && head.name && head.upstream) {
        remote = head.upstream.remote;
        branch = `${head.upstream.name}`;
    }

    return pullFrom(run, repoRoot, repository, HEAD, workingTreeGroup, false, remote, branch, unshallow);
});