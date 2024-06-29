import type { FetchOptions } from "../../api/git.js";
import type { Repository } from "../../git.js";
import { fetchInternal } from "./fetch-internal.js";
import type { RunFn } from "./run.js";

export async function fetch(
    repoRoot: string,
    run: RunFn<void>,
    repository: Repository,
    options: FetchOptions & { silent?: boolean },
): Promise<void> {
    await fetchInternal(repoRoot, run, repository, options);
}
