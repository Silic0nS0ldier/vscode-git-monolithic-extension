import * as os from "node:os";
import { Uri, window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import type { ScmCommand } from "../../helpers.js";

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
                openLabel: i18n.Translations.openRepository(),
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
