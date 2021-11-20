import { window } from "vscode";
import { Repository, Resource } from "../../../repository.js";
import { localize } from "../../../util.js";

export async function cleanUntrackedChanges(repository: Repository, resources: Resource[]): Promise<void> {
	const message = localize('confirm delete multiple', "Are you sure you want to DELETE {0} files?\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST if you proceed.", resources.length);
	const yes = localize('delete files', "Delete Files");
	const pick = await window.showWarningMessage(message, { modal: true }, yes);

	if (pick !== yes) {
		return;
	}

	await repository.clean(resources.map(r => r.resourceUri));
}