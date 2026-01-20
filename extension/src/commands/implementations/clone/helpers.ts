import * as os from "node:os";
import { commands, ProgressLocation, Uri, window, workspace } from "vscode";
import type { Git } from "../../../git.js";
import { GitError } from "../../../git/error.js";
import * as i18n from "../../../i18n/mod.js";
import type { TelemetryReporter } from "@vscode/extension-telemetry";
import { fromCancellationToken } from "../../../util/abort-signal-adapters.js";
import * as config from "../../../util/config.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";

type PostCloneActionOptions = "AddToWorkspace" | "Open" | "OpenNewWindow";
const PostCloneAction: Record<PostCloneActionOptions, PostCloneActionOptions> = {
    AddToWorkspace: "AddToWorkspace",
    Open: "Open",
    OpenNewWindow: "OpenNewWindow",
};

export async function cloneRepository(
    telemetryReporter: TelemetryReporter,
    git: Git,
    url?: string,
    parentPath?: string,
    options: { recursive?: boolean } = {},
): Promise<void> {
    let normalisedUrl = url;
    let normalisedParentPath = parentPath;

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
        let defaultCloneDirectory = config.defaultCloneDirectory();
        defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());

        const uris = await window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: Uri.file(defaultCloneDirectory),
            openLabel: i18n.Translations.selectRepositoryFolder(),
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
            cancellable: true,
            location: ProgressLocation.Notification,
            title: i18n.Translations.cloning(normalisedUrl),
        };

        const repositoryPath = await window.withProgress(
            opts,
            (progress, token) =>
                git.clone(
                    normalisedUrl!,
                    { parentPath: normalisedParentPath!, progress, recursive: options.recursive },
                    fromCancellationToken(token),
                ),
        );

        const openAfterClone = config.openAfterClone();

        let action: PostCloneActionOptions | undefined = undefined;

        if (openAfterClone === "always") {
            action = PostCloneAction.Open;
        } else if (openAfterClone === "alwaysNewWindow") {
            action = PostCloneAction.OpenNewWindow;
        } else if (openAfterClone === "whenNoFolderOpen" && !workspace.workspaceFolders) {
            action = PostCloneAction.Open;
        }

        if (action === undefined) {
            let message = i18n.Translations.proposeOpenClonedRepository();
            const open = i18n.Translations.openRepository2();
            const openNewWindow = i18n.Translations.openRepositoryInNewWindow();
            const choices = [open, openNewWindow];

            const addToWorkspace = i18n.Translations.addToWorkspace();
            if (workspace.workspaceFolders) {
                message = i18n.Translations.proposeOpenClonedRepository2();
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
            workspace.updateWorkspaceFolders(workspace.workspaceFolders?.length ?? 0, 0, { uri });
        } else if (action === PostCloneAction.OpenNewWindow) {
            commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
        }
    } catch (err) {
        if (/already exists and is not an empty directory/.test(err instanceof GitError && err.stderr || "")) {
            /* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
            telemetryReporter.sendTelemetryEvent("clone", { outcome: "directory_not_empty" });
        } else if (isCancelledError(err)) {
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
