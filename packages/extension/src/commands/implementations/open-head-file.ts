import { commands, TextDocumentShowOptions, Uri, window } from "vscode";
import * as path from "node:path";
import { ScmCommand } from "../../commands.js";
import { Resource } from "../../repository.js";
import { localize } from "../../util.js";

export function createCommand(
	getSCMResource: (uri?: Uri) => Resource | undefined,
): ScmCommand {
	async function openHEADFile(arg?: Resource | Uri): Promise<void> {
		let resource: Resource | undefined = undefined;
		const preview = !(arg instanceof Resource);

		if (arg instanceof Resource) {
			resource = arg;
		} else if (arg instanceof Uri) {
			resource = getSCMResource(arg);
		} else {
			resource = getSCMResource();
		}

		if (!resource) {
			return;
		}

		const HEAD = resource.leftUri;
		const basename = path.basename(resource.resourceUri.fsPath);
		const title = `${basename} (HEAD)`;

		if (!HEAD) {
			window.showWarningMessage(localize('HEAD not available', "HEAD version of '{0}' is not available.", path.basename(resource.resourceUri.fsPath)));
			return;
		}

		const opts: TextDocumentShowOptions = {
			preview
		};

		return await commands.executeCommand<void>('vscode.open', HEAD, opts, title);
	};

	return {
		commandId: 'git.openHEADFile',
		method: openHEADFile,
		options: {},
	};
}

