import { QuickPickItem } from "vscode";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export class CreateBranchItem implements QuickPickItem {
    get label(): string {
        return "$(plus) " + localize("create branch", "Create new branch...");
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
        return "$(plus) " + localize("create branch from", "Create new branch from...");
    }
    get description(): string {
        return "";
    }
    get alwaysShow(): boolean {
        return true;
    }
}

export class HEADItem implements QuickPickItem {
    constructor(private repository: Repository) {}

    get label(): string {
        return "HEAD";
    }
    get description(): string {
        return (this.repository.HEAD && this.repository.HEAD.commit || "").substr(0, 8);
    }
    get alwaysShow(): boolean {
        return true;
    }
}
