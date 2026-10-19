import { Uri } from "vscode";
import type { Repository } from "../../git.js";
import * as config from "../../util/config.js";

export async function fetchAndPull(
    repoRoot: string,
    repository: Repository,
    rebase: boolean | undefined,
    remote: string | undefined,
    branch: string | undefined,
    opts: { abortSignal?: AbortSignal; unshallow?: boolean },
): Promise<void> {
    const repositoryUri = Uri.file(repoRoot);

    if (config.fetchOnPull(repositoryUri)) {
        await repository.fetch({ abortSignal: opts.abortSignal, all: true });
    }

    await repository.pull(rebase, remote, branch, {
        abortSignal: opts.abortSignal,
        tags: config.pullTags(repositoryUri),
        unshallow: opts.unshallow,
    });
}
