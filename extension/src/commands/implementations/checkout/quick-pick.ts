/* eslint-disable class-methods-use-this */
import type { QuickPickItem } from "vscode";
import type { Ref } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";

export class CheckoutItem implements QuickPickItem {
    protected get shortCommit(): string {
        return (this.ref.commit || "").slice(0, 8);
    }
    get label(): string {
        return this.ref.name || this.shortCommit;
    }
    get description(): string {
        return this.shortCommit;
    }

    constructor(protected ref: Ref) {}

    async run(repository: AbstractRepository, opts?: { detached?: boolean }): Promise<void> {
        const ref = this.ref.name;

        if (!ref) {
            return;
        }

        await repository.checkout(ref, opts);
    }
}

export class CheckoutTagItem extends CheckoutItem {
    override get description(): string {
        return i18n.Translations.tagAt(this.shortCommit);
    }
}

export class CheckoutRemoteHeadItem extends CheckoutItem {
    override get description(): string {
        return i18n.Translations.remoteBranchAt(this.shortCommit);
    }

    override async run(repository: AbstractRepository, opts?: { detached?: boolean }): Promise<void> {
        if (!this.ref.name) {
            return;
        }

        const [firstBranch] = await repository.findTrackingBranches(this.ref.name);

        if (firstBranch) {
            // TODO Picking the first tracking branch might not always be the desired behavior.
            await repository.checkout(firstBranch.name!, opts);
        } else {
            await repository.checkoutTracking(this.ref.name, opts);
        }
    }
}

export class CheckoutDetachedItem implements QuickPickItem {
    get label(): string {
        return "$(debug-disconnect) " + i18n.Translations.checkoutDetached();
    }
    get description(): string {
        return "";
    }
    get alwaysShow(): boolean {
        return true;
    }
}
