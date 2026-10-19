import { Uri } from "vscode";
import type { Branch, Remote } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import * as config from "../../util/config.js";
import { Operation } from "../Operations.js";
import type { AbstractRepository } from "./AbstractRepository.js";
import { fetchAndPull } from "./fetch-and-pull.js";
import { maybeAutoStash } from "./maybe-auto-stash.js";
import { pushInternal } from "./push-internal.js";
import type { RunFn } from "./run.js";

export async function syncInternal(
    run: RunFn<void>,
    repoRoot: string,
    sourceControlUI: SourceControlUIGroup,
    repository: Repository,
    HEAD: Branch | undefined,
    remotes: Remote[],
    finalRepository: AbstractRepository,
    head: Branch,
    rebase: boolean,
    signal: AbortSignal,
): Promise<void> {
    let remoteName: string | undefined;
    let pullBranch: string | undefined;
    let pushBranch: string | undefined;

    if (head.name && head.upstream) {
        remoteName = head.upstream.remote;
        pullBranch = `${head.upstream.name}`;
        pushBranch = `${head.name}:${head.upstream.name}`;
    }

    await run(Operation.Sync, async () => {
        await maybeAutoStash(
            repoRoot,
            sourceControlUI,
            repository,
            async () => {
                const repositoryUri = Uri.file(repoRoot);
                const followTags = config.followTagsWhenSync(repositoryUri);

                await fetchAndPull(repoRoot, repository, rebase, remoteName, pullBranch, {
                    abortSignal: signal,
                });
                signal.throwIfAborted();

                const remote = remotes.find(r => r.name === remoteName);

                if (remote && remote.isReadOnly) {
                    return;
                }

                const shouldPush = HEAD && (typeof HEAD.ahead === "number" ? HEAD.ahead > 0 : true);

                if (shouldPush) {
                    await pushInternal(
                        repository,
                        finalRepository,
                        remoteName,
                        pushBranch,
                        false,
                        followTags,
                    );
                }
            },
        );
    });
}
