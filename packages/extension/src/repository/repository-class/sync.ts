import type { Branch, Remote } from "../../api/git.js";
import type { Repository } from "../../git.js";
import { throat } from "../../package-patches/throat.js";
import type { IPushErrorHandlerRegistry } from "../../pushError.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import type { AbstractRepository } from "./AbstractRepository.js";
import type { RunFn } from "./run.js";
import { syncInternal } from "./sync-internal.js";

export const sync = throat(1, (
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    sourceControlUI: SourceControlUIGroup,
    repository: Repository,
    HEAD: Branch | undefined,
    remotes: Remote[],
    finalRepository: AbstractRepository,
    pushErrorHandlerRegistry: IPushErrorHandlerRegistry,
    head: Branch,
) => syncInternal(
    run,
    repoRoot,
    sourceControlUI,
    repository,
    HEAD,
    remotes,
    finalRepository,
    pushErrorHandlerRegistry,
    head,
    false,
));
