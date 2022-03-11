import { ApiRepository } from "../../api/api1.js";
import type { ForcePushMode } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { IPushErrorHandlerRegistry } from "../../pushError.js";
import type { AbstractRepository } from "./AbstractRepository.js";

export async function pushInternal(
    repository: Repository,
    finalRepository: AbstractRepository,
    pushErrorHandlerRegistry: IPushErrorHandlerRegistry,
    remote?: string,
    refspec?: string,
    setUpstream: boolean = false,
    followTags = false,
    forcePushMode?: ForcePushMode,
    tags = false,
): Promise<void> {
    try {
        await repository.push(remote, refspec, setUpstream, followTags, forcePushMode, tags);
    } catch (err) {
        if (!remote || !refspec) {
            throw err;
        }

        const repository = new ApiRepository(finalRepository);
        const remoteObj = repository.state.remotes.find(r => r.name === remote);

        if (!remoteObj) {
            throw err;
        }

        for (const handler of pushErrorHandlerRegistry.getPushErrorHandlers()) {
            if (await handler.handlePushError(repository, remoteObj, refspec, err)) {
                return;
            }
        }

        throw err;
    }
}
