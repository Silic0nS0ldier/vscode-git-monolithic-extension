import * as os from "node:os";
import { commands, Uri, window, workspace, type WorkspaceFolder } from "vscode";
import type { Git } from "../../git.js";
import * as i18n from "../../i18n/mod.js";
import type { Model } from "../../model.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(
    git: Git,
    model: Model,
): ScmCommand {
    async function init(skipFolderPrompt = false): Promise<void> {
        let repositoryPath: string | undefined = undefined;
        let askToOpen = true;
        const [firstWorkspaceFolder, ...additionalWorkspaceFolders] = workspace.workspaceFolders ?? [];

        if (firstWorkspaceFolder) {
            if (skipFolderPrompt && additionalWorkspaceFolders.length === 0) {
                repositoryPath = firstWorkspaceFolder.uri.fsPath;
                askToOpen = false;
            } else {
                const placeHolder = i18n.Translations.initRepository();
                const pick = { label: i18n.Translations.chooseFolder() };
                const items: { label: string; folder?: WorkspaceFolder }[] = [
                    ...[firstWorkspaceFolder, ...additionalWorkspaceFolders].map(folder => ({
                        description: folder.uri.fsPath,
                        folder,
                        label: folder.name,
                    })),
                    pick,
                ];
                const item = await window.showQuickPick(items, { ignoreFocusOut: true, placeHolder });

                if (!item) {
                    return;
                } else if (item.folder) {
                    repositoryPath = item.folder.uri.fsPath;
                    askToOpen = false;
                }
            }
        }

        if (!repositoryPath) {
            const homeUri = Uri.file(os.homedir());
            const defaultUri = firstWorkspaceFolder
                ? Uri.file(firstWorkspaceFolder.uri.fsPath)
                : homeUri;

            const [uri, ...otherResults] = await window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri,
                openLabel: i18n.Translations.initRepository2(),
            }) ?? [];

            // Invariant: `otherResults` should be empty when `canSelectMany: false`.
            if (otherResults.length !== 0) {
                throw new Error(`Got ${1 + otherResults.length} results when at most 1 was expected.`);
            }

            if (!uri) {
                return;
            }

            if (homeUri.toString().startsWith(uri.toString())) {
                const yes = i18n.Translations.initRepository2();
                const answer = await window.showWarningMessage(
                    i18n.Translations.initRepositoryConfirm(uri),
                    yes,
                );

                if (answer !== yes) {
                    return;
                }
            }

            repositoryPath = uri.fsPath;

            if (
                workspace.workspaceFolders && workspace.workspaceFolders.some(w => w.uri.toString() === uri.toString())
            ) {
                askToOpen = false;
            }
        }

        await git.init(repositoryPath);

        // TODO Logic flow here seems flawed
        let message = i18n.Translations.proposeOpenInitedRepository();
        const open = i18n.Translations.openRepository2();
        const openNewWindow = i18n.Translations.openRepositoryInNewWindow();
        const choices = [open, openNewWindow];

        if (!askToOpen) {
            return;
        }

        const addToWorkspace = i18n.Translations.addToWorkspace();
        if (workspace.workspaceFolders) {
            message = i18n.Translations.proposeOpenInitedRepository2();
            choices.push(addToWorkspace);
        }

        const result = await window.showInformationMessage(message, ...choices);
        const uri = Uri.file(repositoryPath);

        if (result === open) {
            commands.executeCommand("vscode.openFolder", uri);
        } else if (result === addToWorkspace) {
            workspace.updateWorkspaceFolders(workspace.workspaceFolders?.length ?? 0, 0, { uri });
        } else if (result === openNewWindow) {
            commands.executeCommand("vscode.openFolder", uri, true);
        } else {
            await model.openRepository(repositoryPath);
        }
    }

    return {
        commandId: makeCommandId("init"),
        method: init,
        options: {},
    };
}
