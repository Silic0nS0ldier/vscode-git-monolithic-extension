/* eslint-disable class-methods-use-this */
import type { QuickPickItem } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";

export class CreateBranchItem implements QuickPickItem {
    get label(): string {
        return "$(plus) " + i18n.Translations.createBranch();
    }
    get description(): string {
        return "";
    }
    get alwaysShow(): boolean {
        return true;
    }
}

export class CreateBranchFromItem implements QuickPickItem {
    get label(): string {
        return "$(plus) " + i18n.Translations.createBranchFrom();
    }
    get description(): string {
        return "";
    }
    get alwaysShow(): boolean {
        return true;
    }
}

export class HEADItem implements QuickPickItem {
    #repository: AbstractRepository;
    constructor(repository: AbstractRepository) {
        this.#repository = repository;
    }

    get label(): string {
        return "HEAD";
    }
    get description(): string {
        return (this.#repository.HEAD?.commit || "").substr(0, 8);
    }
    get alwaysShow(): boolean {
        return true;
    }
}
