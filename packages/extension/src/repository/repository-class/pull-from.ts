import { Uri, workspace } from "vscode";
import type { Branch } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { Operation } from "../Operations.js";
import { checkIfMaybeRebased } from "./check-if-maybe-rebased.js";
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
                const config = workspace.getConfiguration("git", Uri.file(repoRoot));
                const fetchOnPull = config.get<boolean>("fetchOnPull");
                const tags = config.get<boolean>("pullTags");

                // When fetchOnPull is enabled, fetch all branches when pulling
                if (fetchOnPull) {
                    await repository.fetch({ all: true });
                }

                if (await checkIfMaybeRebased(run, repository, HEAD?.name)) {
                    await repository.pull(rebase, remote, branch, { tags, unshallow });
                }
            },
        );
    });
}
