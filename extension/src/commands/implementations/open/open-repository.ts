import * as os from "node:os";
import { Uri, window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand {
    async function openRepository(repoPath?: string): Promise<void> {
        let normalisedRepoPath = repoPath;
        if (!normalisedRepoPath) {
            const [result, ...otherResults] = await window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: Uri.file(os.homedir()),
                openLabel: i18n.Translations.openRepository(),
            }) ?? [];

            // Invariant: `otherResults` should be empty when `canSelectMany: false`.
            if (otherResults.length !== 0) {
                throw new Error(`Got ${1 + otherResults.length} results when at most 1 was expected.`);
            }

            if (!result) {
                return;
            }

            normalisedRepoPath = result.fsPath;
        }

        await model.openRepository(normalisedRepoPath);
    }

    return {
        commandId: makeCommandId("openRepository"),
        method: openRepository,
        options: {
            repository: false,
        },
    };
}
