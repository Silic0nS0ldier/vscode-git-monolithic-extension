import { QuickPickItem } from "vscode";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export class CreateBranchItem implements QuickPickItem {
    constructor() {
        this.label = "$(plus) " + localize("create branch", "Create new branch...");
        this.description = "";
        this.alwaysShow = true;
    }
    label: string;
    description: string;
    alwaysShow: boolean;
}

export class CreateBranchFromItem implements QuickPickItem {
    constructor() {
        this.label = "$(plus) " + localize("create branch from", "Create new branch from...");
        this.description = "";
        this.alwaysShow = true;
    }
    label: string;
    description: string;
    alwaysShow: boolean;
}

export class HEADItem implements QuickPickItem {
    constructor(private repository: Repository) {
        this.label = "HEAD";
        this.alwaysShow = true;
    }

    label: string;
    get description(): string {
        return (this.repository.HEAD && this.repository.HEAD.commit || "").substr(0, 8);
    }
    alwaysShow: boolean;
}
