import path from "node:path";
import type { Uri } from "vscode";
import { Status } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { Submodule } from "../../git/Submodule.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { find } from "../../util.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function clean(
    run: RunFn<void>,
    sourceControlUI: SourceControlUIGroup,
    submodules: Submodule[],
    repoRoot: string,
    repository: Repository,
    resources: Uri[],
): Promise<void> {
    await run(Operation.Clean, async () => {
        const toClean: string[] = [];
        const toCheckout: string[] = [];
        const submodulesToUpdate: string[] = [];
        const resourceStates = [
            ...sourceControlUI.trackedGroup.resourceStates.get(),
            ...sourceControlUI.untrackedGroup.resourceStates.get(),
        ];

        resources.forEach(r => {
            const fsPath = r.fsPath;

            for (const submodule of submodules) {
                if (path.join(repoRoot, submodule.path) === fsPath) {
                    submodulesToUpdate.push(fsPath);
                    return;
                }
            }

            const raw = r.toString();
            const scmResource = find(resourceStates, sr => sr.state.resourceUri.toString() === raw);

            if (!scmResource) {
                return;
            }

            switch (scmResource.state.type) {
                case Status.UNTRACKED:
                case Status.IGNORED:
                    toClean.push(fsPath);
                    break;

                default:
                    toCheckout.push(fsPath);
                    break;
            }
        });

        await repository.clean(toClean);
        await repository.checkout("", toCheckout);
        await repository.updateSubmodules(submodulesToUpdate);
    });
}
