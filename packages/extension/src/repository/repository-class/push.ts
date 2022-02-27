import { Branch, ForcePushMode } from "../../api/git.js";
import { Repository } from "../../git.js";
import { throat } from "../../package-patches/throat.js";
import { IPushErrorHandlerRegistry } from "../../pushError.js";
import { Operation } from "../Operations.js";
import { FinalRepository } from "./mod.js";
import { pushInternal } from "./push-internal.js";
import { RunFn } from "./run.js";

export const push = throat(1, async (
    run: RunFn<void>,
    repository: Repository,
    finalRepository: FinalRepository,
    pushErrorHandlerRegistry: IPushErrorHandlerRegistry,
    head: Branch,
    forcePushMode?: ForcePushMode,
) => {
    let remote: string | undefined;
    let branch: string | undefined;

    if (head && head.name && head.upstream) {
        remote = head.upstream.remote;
        branch = `${head.name}:${head.upstream.name}`;
    }

    await run(
        Operation.Push,
        () =>
            pushInternal(
                repository,
                finalRepository,
                pushErrorHandlerRegistry,
                remote,
                branch,
                undefined,
                undefined,
                forcePushMode,
            ),
    );
});
