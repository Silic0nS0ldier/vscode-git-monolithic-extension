import * as os from "node:os";
import { commands, Uri, window, workspace, WorkspaceFolder } from "vscode";
import type { Git } from "../../git.js";
import type { Model } from "../../model.js";
import { localize } from "../../util.js";
import type { ScmCommand } from "../helpers.js";

export function createCommand(
    git: Git,
    model: Model,
): ScmCommand {
    async function init(skipFolderPrompt = false): Promise<void> {
        let repositoryPath: string | undefined = undefined;
        let askToOpen = true;

        if (workspace.workspaceFolders) {
            if (skipFolderPrompt && workspace.workspaceFolders.length === 1) {
                repositoryPath = workspace.workspaceFolders[0].uri.fsPath;
                askToOpen = false;
            } else {
                const placeHolder = localize("init", "Pick workspace folder to initialize git repo in");
                const pick = { label: localize("choose", "Choose Folder...") };
                const items: { label: string; folder?: WorkspaceFolder }[] = [
                    ...workspace.workspaceFolders.map(folder => ({
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
            const defaultUri = workspace.workspaceFolders && workspace.workspaceFolders.length > 0
                ? Uri.file(workspace.workspaceFolders[0].uri.fsPath)
                : homeUri;

            const result = await window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri,
                openLabel: localize("init repo", "Initialize Repository"),
            });

            if (!result || result.length === 0) {
                return;
            }

            const uri = result[0];

            if (homeUri.toString().startsWith(uri.toString())) {
                const yes = localize("create repo", "Initialize Repository");
                const answer = await window.showWarningMessage(
                    localize(
                        "are you sure",
                        "This will create a Git repository in '{0}'. Are you sure you want to continue?",
                        uri.fsPath,
                    ),
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

        let message = localize("proposeopen init", "Would you like to open the initialized repository?");
        const open = localize("openrepo", "Open");
        const openNewWindow = localize("openreponew", "Open in New Window");
        const choices = [open, openNewWindow];

        if (!askToOpen) {
            return;
        }

        const addToWorkspace = localize("add", "Add to Workspace");
        if (workspace.workspaceFolders) {
            message = localize(
                "proposeopen2 init",
                "Would you like to open the initialized repository, or add it to the current workspace?",
            );
            choices.push(addToWorkspace);
        }

        const result = await window.showInformationMessage(message, ...choices);
        const uri = Uri.file(repositoryPath);

        if (result === open) {
            commands.executeCommand("vscode.openFolder", uri);
        } else if (result === addToWorkspace) {
            workspace.updateWorkspaceFolders(workspace.workspaceFolders!.length, 0, { uri });
        } else if (result === openNewWindow) {
            commands.executeCommand("vscode.openFolder", uri, true);
        } else {
            await model.openRepository(repositoryPath);
        }
    }

    return {
        commandId: "git.init",
        method: init,
        options: {},
    };
}
