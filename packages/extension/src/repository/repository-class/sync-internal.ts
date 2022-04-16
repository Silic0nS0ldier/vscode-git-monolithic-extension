/* eslint-disable sort-keys */
import { ProgressLocation, ProgressOptions, Uri, window, workspace } from "vscode";
import type { Branch, Remote } from "../../api/git.js";
import type { Repository } from "../../git.js";
import * as i18n from "../../i18n/mod.js";
import type { IPushErrorHandlerRegistry } from "../../pushError.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { fromCancellationToken } from "../../util/abort-signal-adapters.js";
import { Operation } from "../Operations.js";
import type { AbstractRepository } from "./AbstractRepository.js";
import { checkIfMaybeRebased } from "./check-if-maybe-rebased.js";
import { maybeAutoStash } from "./maybe-auto-stash.js";
import { pushInternal } from "./push-internal.js";
import type { RunFn } from "./run.js";

export async function syncInternal(
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    sourceControlUI: SourceControlUIGroup,
    repository: Repository,
    HEAD: Branch | undefined,
    remotes: Remote[],
    finalRepository: AbstractRepository,
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
            sourceControlUI,
            repository,
            async () => {
                const config = workspace.getConfiguration("git", Uri.file(repoRoot));
                const fetchOnPull = config.get<boolean>("fetchOnPull");
                const tags = config.get<boolean>("pullTags");
                const followTags = config.get<boolean>("followTagsWhenSync");
                const supportCancellation = config.get<boolean>("supportCancellation");

                const fn = async (abortSignal?: AbortSignal) => {
                    // When fetchOnPull is enabled, fetch all branches when pulling
                    if (fetchOnPull) {
                        await repository.fetch({ all: true, abortSignal });
                    }

                    if (await checkIfMaybeRebased(run, repository, HEAD?.name)) {
                        await repository.pull(rebase, remoteName, pullBranch, { abortSignal, tags });
                    }
                };

                if (supportCancellation) {
                    const opts: ProgressOptions = {
                        cancellable: true,
                        location: ProgressLocation.Notification,
                        title: i18n.Translations.syncIsUnpredictable(),
                    };

                    await window.withProgress(opts, (_, token) => fn(fromCancellationToken(token)));
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
