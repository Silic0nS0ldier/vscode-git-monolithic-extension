import { QuickPickItem } from "vscode";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";

export class AddRemoteItem implements QuickPickItem {
    constructor(private addRemote: (repository: AbstractRepository) => Promise<string | void>) {}

    get label(): string {
        return "$(plus) " + localize("add remote", "Add a new remote...");
    }
    get description(): string {
        return "";
    }

    get alwaysShow(): boolean {
        return true;
    }

    async run(repository: AbstractRepository): Promise<void> {
        await this.addRemote(repository);
    }
}
