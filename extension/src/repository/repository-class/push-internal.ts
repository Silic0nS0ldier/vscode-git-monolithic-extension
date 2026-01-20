import type { ForcePushModeOptions } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { AbstractRepository } from "./AbstractRepository.js";

export async function pushInternal(
    repository: Repository,
    finalRepository: AbstractRepository,
    remote?: string,
    refspec?: string,
    setUpstream: boolean = false,
    followTags = false,
    forcePushMode?: ForcePushModeOptions,
    tags = false,
): Promise<void> {
    try {
        await repository.push(remote, refspec, setUpstream, followTags, forcePushMode, tags);
    } catch (err) {
        if (!remote || !refspec) {
            throw err;
        }

        const remoteObj = finalRepository.remotes.find(r => r.name === remote);

        if (!remoteObj) {
            throw err;
        }

        throw err;
    }
}
