import * as path from "node:path";
import { commands, OutputChannel, TextDocumentShowOptions, Uri, window } from "vscode";
import type { Model } from "../../../../model.js";
import { Resource } from "../../../../repository/Resource.js";
import { localize } from "../../../../util.js";
import type { ScmCommand } from "../../../helpers.js";
import { getSCMResource } from "../../../helpers.js";

export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function openHEADFile(arg?: Resource | Uri): Promise<void> {
        let resource: Resource | undefined = undefined;
        const preview = !(arg instanceof Resource);

        if (arg instanceof Resource) {
            resource = arg;
        } else if (arg instanceof Uri) {
            resource = getSCMResource(model, outputChannel, arg);
        } else {
            resource = getSCMResource(model, outputChannel);
        }

        if (!resource) {
            return;
        }

        const HEAD = resource.state.leftUri;
        const basename = path.basename(resource.state.resourceUri.fsPath);
        const title = `${basename} (HEAD)`;

        if (!HEAD) {
            window.showWarningMessage(
                localize(
                    "HEAD not available",
                    "HEAD version of '{0}' is not available.",
                    path.basename(resource.state.resourceUri.fsPath),
                ),
            );
            return;
        }

        const opts: TextDocumentShowOptions = {
            preview,
        };

        return await commands.executeCommand<void>("vscode.open", HEAD, opts, title);
    }

    return {
        commandId: "git.openHEADFile",
        method: openHEADFile,
        options: {},
    };
}
