import { Uri, workspace } from "vscode";
import type { FetchOptions } from "../../api/git.js";
import type { Repository } from "../../git.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function fetchInternal(
    repoRoot: string,
    run: RunFn<void>,
    repository: Repository,
    options: FetchOptions & { silent?: boolean } = {},
): Promise<void> {
    if (!options.prune) {
        const config = workspace.getConfiguration("git", Uri.file(repoRoot));
        const prune = config.get<boolean>("pruneOnFetch");
        options.prune = prune;
    }

    await run(Operation.Fetch, async () => repository.fetch(options));
}
