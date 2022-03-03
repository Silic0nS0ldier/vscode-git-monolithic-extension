import path from "node:path";
import { Uri } from "vscode";
import { Status } from "../../api/git.js";
import { Repository } from "../../git.js";
import { Submodule } from "../../git/Submodule.js";
import { find } from "../../util.js";
import { GitResourceGroup } from "../GitResourceGroup.js";
import { Operation } from "../Operations.js";
import { RunFn } from "./run.js";

export async function clean(
    run: RunFn<void>,
    workingTreeGroup: GitResourceGroup,
    untrackedGroup: GitResourceGroup,
    submodules: Submodule[],
    repoRoot: string,
    repository: Repository,
    resources: Uri[],
): Promise<void> {
    await run(Operation.Clean, async () => {
        const toClean: string[] = [];
        const toCheckout: string[] = [];
        const submodulesToUpdate: string[] = [];
        const resourceStates = [...workingTreeGroup.resourceStates, ...untrackedGroup.resourceStates];

        resources.forEach(r => {
            const fsPath = r.fsPath;

            for (const submodule of submodules) {
                if (path.join(repoRoot, submodule.path) === fsPath) {
                    submodulesToUpdate.push(fsPath);
                    return;
                }
            }

            const raw = r.toString();
            const scmResource = find(resourceStates, sr => sr.resourceUri.toString() === raw);

            if (!scmResource) {
                return;
            }

            switch (scmResource.type) {
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
