import * as os from "node:os";
import { Uri, window } from "vscode";
import { Model } from "../../../model.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand {
    async function openRepository(repoPath?: string): Promise<void> {
        let normalisedRepoPath = repoPath;
        if (!normalisedRepoPath) {
            const result = await window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: Uri.file(os.homedir()),
                openLabel: localize("open repo", "Open Repository"),
            });

            if (!result || result.length === 0) {
                return;
            }

            normalisedRepoPath = result[0].fsPath;
        }

        await model.openRepository(normalisedRepoPath);
    }

    return {
        commandId: "git.openRepository",
        method: openRepository,
        options: {
            repository: false,
        },
    };
}
