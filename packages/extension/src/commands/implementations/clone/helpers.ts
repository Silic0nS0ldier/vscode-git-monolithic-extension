import * as os from "node:os";
import { commands, ProgressLocation, Uri, window, workspace } from "vscode";
import { Git } from "../../../git.js";
import { Model } from "../../../model.js";
import { TelemetryReporter } from "../../../package-patches/vscode-extension-telemetry.js";
import { pickRemoteSource } from "../../../remoteSource.js";
import { localize } from "../../../util.js";

export async function cloneRepository(
    model: Model,
    telemetryReporter: TelemetryReporter,
    git: Git,
    url?: string,
    parentPath?: string,
    options: { recursive?: boolean } = {},
): Promise<void> {
    let normalisedUrl = url;
    let normalisedParentPath = parentPath;
    if (!normalisedUrl || typeof normalisedUrl !== "string") {
        normalisedUrl = await pickRemoteSource(model, {
            providerLabel: provider => localize("clonefrom", "Clone from {0}", provider.name),
            urlLabel: localize("repourl", "Clone from URL"),
        });
    }

    if (!normalisedUrl) {
        /* __GDPR__
			"clone" : {
				"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
        telemetryReporter.sendTelemetryEvent("clone", { outcome: "no_URL" });
        return;
    }

    normalisedUrl = normalisedUrl.trim().replace(/^git\s+clone\s+/, "");

    if (!normalisedParentPath) {
        const config = workspace.getConfiguration("git");
        let defaultCloneDirectory = config.get<string>("defaultCloneDirectory") || os.homedir();
        defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());

        const uris = await window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: Uri.file(defaultCloneDirectory),
            openLabel: localize("selectFolder", "Select Repository Location"),
        });

        if (!uris || uris.length === 0) {
            /* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
            telemetryReporter.sendTelemetryEvent("clone", { outcome: "no_directory" });
            return;
        }

        const uri = uris[0];
        normalisedParentPath = uri.fsPath;
    }

    try {
        const opts = {
            location: ProgressLocation.Notification,
            title: localize("cloning", "Cloning git repository '{0}'...", normalisedUrl),
            cancellable: true,
        };

        const repositoryPath = await window.withProgress(
            opts,
            (progress, token) =>
                git.clone(normalisedUrl!, { parentPath: normalisedParentPath!, progress, recursive: options.recursive }, token),
        );

        const config = workspace.getConfiguration("git");
        const openAfterClone = config.get<"always" | "alwaysNewWindow" | "whenNoFolderOpen" | "prompt">(
            "openAfterClone",
        );

        enum PostCloneAction {
            Open,
            OpenNewWindow,
            AddToWorkspace,
        }
        let action: PostCloneAction | undefined = undefined;

        if (openAfterClone === "always") {
            action = PostCloneAction.Open;
        } else if (openAfterClone === "alwaysNewWindow") {
            action = PostCloneAction.OpenNewWindow;
        } else if (openAfterClone === "whenNoFolderOpen" && !workspace.workspaceFolders) {
            action = PostCloneAction.Open;
        }

        if (action === undefined) {
            let message = localize("proposeopen", "Would you like to open the cloned repository?");
            const open = localize("openrepo", "Open");
            const openNewWindow = localize("openreponew", "Open in New Window");
            const choices = [open, openNewWindow];

            const addToWorkspace = localize("add", "Add to Workspace");
            if (workspace.workspaceFolders) {
                message = localize(
                    "proposeopen2",
                    "Would you like to open the cloned repository, or add it to the current workspace?",
                );
                choices.push(addToWorkspace);
            }

            const result = await window.showInformationMessage(message, ...choices);

            action = result === open
                ? PostCloneAction.Open
                : result === openNewWindow
                ? PostCloneAction.OpenNewWindow
                : result === addToWorkspace
                ? PostCloneAction.AddToWorkspace
                : undefined;
        }

        /* __GDPR__
			"clone" : {
				"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
        telemetryReporter.sendTelemetryEvent("clone", { outcome: "success" }, {
            openFolder: action === PostCloneAction.Open || action === PostCloneAction.OpenNewWindow ? 1 : 0,
        });

        const uri = Uri.file(repositoryPath);

        if (action === PostCloneAction.Open) {
            commands.executeCommand("vscode.openFolder", uri, { forceReuseWindow: true });
        } else if (action === PostCloneAction.AddToWorkspace) {
            workspace.updateWorkspaceFolders(workspace.workspaceFolders!.length, 0, { uri });
        } else if (action === PostCloneAction.OpenNewWindow) {
            commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
        }
    } catch (err) {
        if (/already exists and is not an empty directory/.test(err && err.stderr || "")) {
            /* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
            telemetryReporter.sendTelemetryEvent("clone", { outcome: "directory_not_empty" });
        } else if (/Cancelled/i.test(err && (err.message || err.stderr || ""))) {
            return;
        } else {
            /* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
            telemetryReporter.sendTelemetryEvent("clone", { outcome: "error" });
        }

        throw err;
    }
}
