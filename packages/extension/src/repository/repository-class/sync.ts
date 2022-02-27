import { Branch, Remote } from "../../api/git.js";
import { Repository } from "../../git.js";
import { throat } from "../../package-patches/throat.js";
import { IPushErrorHandlerRegistry } from "../../pushError.js";
import { GitResourceGroup } from "../GitResourceGroup.js";
import { FinalRepository } from "./mod.js";
import { RunFn } from "./run.js";
import { syncInternal } from "./sync-internal.js";

export const sync = throat(1, (
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    workingTreeGroup: GitResourceGroup,
    repository: Repository,
    HEAD: Branch | undefined,
    remotes: Remote[],
    finalRepository: FinalRepository,
    pushErrorHandlerRegistry: IPushErrorHandlerRegistry,
    head: Branch,
) => syncInternal(
    run,
    repoRoot,
    workingTreeGroup,
    repository,
    HEAD,
    remotes,
    finalRepository,
    pushErrorHandlerRegistry,
    head,
    false,
));
