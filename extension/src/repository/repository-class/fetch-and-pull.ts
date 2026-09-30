import { Uri } from "vscode";
import type { Repository } from "../../git.js";
import * as config from "../../util/config.js";
import { checkIfMaybeRebased } from "./check-if-maybe-rebased.js";
import type { RunFn } from "./run.js";

export async function fetchAndPull(
    run: RunFn<boolean>,
    repoRoot: string,
    repository: Repository,
    currentBranch: string | undefined,
    rebase: boolean | undefined,
    remote: string | undefined,
    branch: string | undefined,
    opts: { abortSignal?: AbortSignal; unshallow?: boolean },
): Promise<void> {
    const repositoryUri = Uri.file(repoRoot);

    if (config.fetchOnPull(repositoryUri)) {
        await repository.fetch({ abortSignal: opts.abortSignal, all: true });
    }

    if (await checkIfMaybeRebased(run, repository, currentBranch)) {
        await repository.pull(rebase, remote, branch, {
            abortSignal: opts.abortSignal,
            tags: config.pullTags(repositoryUri),
            unshallow: opts.unshallow,
        });
    }
}
