import { QuickPickItem } from "vscode";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";

export class AddRemoteItem implements QuickPickItem {
    constructor(private addRemote: (repository: FinalRepository) => Promise<string | void>) {}

    get label(): string {
        return "$(plus) " + localize("add remote", "Add a new remote...");
    }
    get description(): string {
        return "";
    }

    get alwaysShow(): boolean {
        return true;
    }

    async run(repository: FinalRepository): Promise<void> {
        await this.addRemote(repository);
    }
}
