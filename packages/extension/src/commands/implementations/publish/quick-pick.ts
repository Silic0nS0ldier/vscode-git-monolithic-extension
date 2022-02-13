import { QuickPickItem } from "vscode";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export class AddRemoteItem implements QuickPickItem {
    constructor(private addRemote: (repository: Repository) => Promise<string | void>) {
        this.label = "$(plus) " + localize("add remote", "Add a new remote...");
        this.description = "";
        this.alwaysShow = true;
    }

    label: string;
    description: string;

    alwaysShow: boolean;

    async run(repository: Repository): Promise<void> {
        await this.addRemote(repository);
    }
}
