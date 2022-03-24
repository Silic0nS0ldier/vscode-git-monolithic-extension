import type { QuickPickItem } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";

export class AddRemoteItem implements QuickPickItem {
    #addRemote: (repository: AbstractRepository) => Promise<string | void>;
    constructor(addRemote: (repository: AbstractRepository) => Promise<string | void>) {
        this.#addRemote = addRemote;
    }

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
        await this.#addRemote(repository);
    }
}
