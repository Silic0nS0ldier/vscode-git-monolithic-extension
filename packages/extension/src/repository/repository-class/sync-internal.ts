import { CancellationToken, ProgressLocation, ProgressOptions, Uri, window, workspace } from "vscode";
import { Branch, Remote } from "../../api/git.js";
import { Repository } from "../../git.js";
import { IPushErrorHandlerRegistry } from "../../pushError.js";
import { localize } from "../../util.js";
import { GitResourceGroup } from "../GitResourceGroup.js";
import { Operation } from "../Operations.js";
import { checkIfMaybeRebased } from "./check-if-maybe-rebased.js";
import { maybeAutoStash } from "./maybe-auto-stash.js";
import { FinalRepository } from "./mod.js";
import { pushInternal } from "./push-internal.js";
import { RunFn } from "./run.js";

export async function syncInternal(
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    workingTreeGroup: GitResourceGroup,
    repository: Repository,
    HEAD: Branch | undefined,
    remotes: Remote[],
    finalRepository: FinalRepository,
    pushErrorHandlerRegistry: IPushErrorHandlerRegistry,
    head: Branch,
    rebase: boolean,
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
            workingTreeGroup,
            repository,
            async () => {
                const config = workspace.getConfiguration("git", Uri.file(repoRoot));
                const fetchOnPull = config.get<boolean>("fetchOnPull");
                const tags = config.get<boolean>("pullTags");
                const followTags = config.get<boolean>("followTagsWhenSync");
                const supportCancellation = config.get<boolean>("supportCancellation");

                const fn = async (cancellationToken?: CancellationToken) => {
                    // When fetchOnPull is enabled, fetch all branches when pulling
                    if (fetchOnPull) {
                        await repository.fetch({ all: true, cancellationToken });
                    }

                    if (await checkIfMaybeRebased(run, repository, HEAD?.name)) {
                        await repository.pull(rebase, remoteName, pullBranch, { tags, cancellationToken });
                    }
                };

                if (supportCancellation) {
                    const opts: ProgressOptions = {
                        location: ProgressLocation.Notification,
                        title: localize(
                            "sync is unpredictable",
                            "Syncing. Cancelling may cause serious damages to the repository",
                        ),
                        cancellable: true,
                    };

                    await window.withProgress(opts, (_, token) => fn(token));
                } else {
                    await fn();
                }

                const remote = remotes.find(r => r.name === remoteName);

                if (remote && remote.isReadOnly) {
                    return;
                }

                const shouldPush = HEAD && (typeof HEAD.ahead === "number" ? HEAD.ahead > 0 : true);

                if (shouldPush) {
                    await pushInternal(
                        repository,
                        finalRepository,
                        pushErrorHandlerRegistry,
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
