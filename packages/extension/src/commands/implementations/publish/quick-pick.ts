/* eslint-disable class-methods-use-this */
import type { QuickPickItem } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";

export class AddRemoteItem implements QuickPickItem {
    #addRemote: (repository: AbstractRepository) => Promise<string | void>;
    constructor(addRemote: (repository: AbstractRepository) => Promise<string | void>) {
        this.#addRemote = addRemote;
    }

    get label(): string {
        return "$(plus) " + i18n.Translations.addRemote2();
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
