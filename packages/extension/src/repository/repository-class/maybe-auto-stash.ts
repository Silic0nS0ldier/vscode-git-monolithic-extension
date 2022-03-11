import { Uri, workspace } from "vscode";
import { Status } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";

export async function maybeAutoStash<T>(
    repoRoot: string,
    sourceControlUI: SourceControlUIGroup,
    repository: Repository,
    runOperation: () => Promise<T>,
): Promise<T> {
    const config = workspace.getConfiguration("git", Uri.file(repoRoot));
    const shouldAutoStash = config.get<boolean>("autoStash")
        && sourceControlUI.trackedGroup.resourceStates.get().some(r =>
            r.state.type !== Status.UNTRACKED && r.state.type !== Status.IGNORED
        );

    if (!shouldAutoStash) {
        return await runOperation();
    }

    await repository.createStash(undefined, true);
    const result = await runOperation();
    await repository.popStash();

    return result;
}
