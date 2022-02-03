import { QuickPickItem } from "vscode";
import { Ref } from "../../../api/git.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";

export class CheckoutItem implements QuickPickItem {
    protected get shortCommit(): string {
        return (this.ref.commit || "").substr(0, 8);
    }
    get label(): string {
        return this.ref.name || this.shortCommit;
    }
    get description(): string {
        return this.shortCommit;
    }

    constructor(protected ref: Ref) {}

    async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
        const ref = this.ref.name;

        if (!ref) {
            return;
        }

        await repository.checkout(ref, opts);
    }
}

export class CheckoutTagItem extends CheckoutItem {
    override get description(): string {
        return localize("tag at", "Tag at {0}", this.shortCommit);
    }
}

export class CheckoutRemoteHeadItem extends CheckoutItem {
    override get description(): string {
        return localize("remote branch at", "Remote branch at {0}", this.shortCommit);
    }

    override async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
        if (!this.ref.name) {
            return;
        }

        const branches = await repository.findTrackingBranches(this.ref.name);

        if (branches.length > 0) {
            await repository.checkout(branches[0].name!, opts);
        } else {
            await repository.checkoutTracking(this.ref.name, opts);
        }
    }
}

export class CheckoutDetachedItem implements QuickPickItem {
    get label(): string {
        return "$(debug-disconnect) " + localize("checkout detached", "Checkout detached...");
    }
    get description(): string {
        return "";
    }
    get alwaysShow(): boolean {
        return true;
    }
}
