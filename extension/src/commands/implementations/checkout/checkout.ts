import { type QuickPickItem, window } from "vscode";
import { GitErrorCodes } from "../../../api/git.js";
import { GitError } from "../../../git/error.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isExpectedError } from "../../../util/is-expected-error.js";
import type { ScmCommand } from "../../helpers.js";
import { branch } from "../branch/helpers.js";
import { CreateBranchFromItem, CreateBranchItem } from "../branch/quick-pick.js";
import { cleanAll } from "../clean/clean-all.js";
import { createStash } from "../stash/helpers.js";
import { stashPopLatest } from "../stash/stash-pop-latest.js";
import { createCheckoutItems } from "./helpers.js";
import { CheckoutDetachedItem, CheckoutItem } from "./quick-pick.js";

export async function checkout(
    repository: AbstractRepository,
    opts?: { detached?: boolean; treeish?: string },
): Promise<boolean> {
    if (typeof opts?.treeish === "string") {
        await repository.checkout(opts?.treeish, opts);
        return true;
    }

    const createBranch = new CreateBranchItem();
    const createBranchFrom = new CreateBranchFromItem();
    const checkoutDetached = new CheckoutDetachedItem();
    const picks: QuickPickItem[] = [];

    if (!opts?.detached) {
        picks.push(createBranch, createBranchFrom, checkoutDetached);
    }

    picks.push(...createCheckoutItems(repository));

    const quickpick = window.createQuickPick();
    quickpick.items = picks;
    quickpick.placeholder = opts?.detached
        ? i18n.Translations.selectRefToCheckoutDetached()
        : i18n.Translations.selectRefToCheckout();

    quickpick.show();

    const choice = await new Promise<QuickPickItem | undefined>(c =>
        quickpick.onDidAccept(() => c(quickpick.activeItems[0]))
    );
    quickpick.hide();

    if (!choice) {
        return false;
    }

    if (choice === createBranch) {
        await branch(repository, quickpick.value);
    } else if (choice === createBranchFrom) {
        await branch(repository, quickpick.value, true);
    } else if (choice === checkoutDetached) {
        return checkout(repository, { detached: true });
    } else {
        const item = choice as CheckoutItem;

        try {
            await item.run(repository, opts);
        } catch (err) {
            if (!isExpectedError(err, GitError, e => e.gitErrorCode === GitErrorCodes.DirtyWorkTree)) {
                throw err;
            }

            const force = i18n.Translations.forceCheckout();
            const stash = i18n.Translations.stashAndCheckout();
            const choice = await window.showWarningMessage(
                i18n.Translations.localChanges(),
                { modal: true },
                force,
                stash,
            );

            if (choice === force) {
                await cleanAll(repository);
                await item.run(repository, opts);
            } else if (choice === stash) {
                await createStash(repository);
                await item.run(repository, opts);
                await stashPopLatest(repository);
            }
        }
    }

    return true;
}

export function createCommand(): ScmCommand {
    async function checkoutFn(repository: AbstractRepository, treeish?: string): Promise<boolean> {
        return checkout(repository, { treeish });
    }

    return {
        commandId: "git.checkout",
        method: checkoutFn,
        options: {
            repository: true,
        },
    };
}
