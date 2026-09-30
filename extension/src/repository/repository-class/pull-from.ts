import type { Branch } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { Operation } from "../Operations.js";
import { fetchAndPull } from "./fetch-and-pull.js";
import { maybeAutoStash } from "./maybe-auto-stash.js";
import type { RunFn } from "./run.js";

export async function pullFrom(
    run: RunFn<void> & RunFn<boolean>,
    repoRoot: string,
    repository: Repository,
    HEAD: Branch | undefined,
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
                await fetchAndPull(run, repoRoot, repository, HEAD?.name, rebase, remote, branch, { unshallow });
            },
        );
    });
}
