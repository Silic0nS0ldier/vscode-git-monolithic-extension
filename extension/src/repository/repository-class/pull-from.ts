import type { Repository } from "../../git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { Operation } from "../Operations.js";
import { fetchAndPull } from "./fetch-and-pull.js";
import { maybeAutoStash } from "./maybe-auto-stash.js";
import type { RunFn } from "./run.js";

export async function pullFrom(
    run: RunFn<void>,
    repoRoot: string,
    repository: Repository,
    sourceControlUI: SourceControlUIGroup,
    rebase?: boolean,
    remote?: string,
    branch?: string,
    unshallow?: boolean,
): Promise<void> {
    await run(Operation.Pull, async () => {
        await maybeAutoStash(
            repoRoot,
            sourceControlUI,
            repository,
            async () => {
                await fetchAndPull(repoRoot, repository, rebase, remote, branch, { unshallow });
            },
        );
    });
}
