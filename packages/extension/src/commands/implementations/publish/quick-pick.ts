import { QuickPickItem } from "vscode";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export class AddRemoteItem implements QuickPickItem {
    constructor(private addRemote: (repository: Repository) => Promise<string | void>) {}

    get label(): string {
        return "$(plus) " + localize("add remote", "Add a new remote...");
    }
    get description(): string {
        return "";
    }

    get alwaysShow(): boolean {
        return true;
    }

    async run(repository: Repository): Promise<void> {
        await this.addRemote(repository);
    }
}
