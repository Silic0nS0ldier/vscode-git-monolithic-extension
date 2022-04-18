import { QuickPickItem, window } from "vscode";
import { GitErrorCodes, Ref, RefType } from "../../../api/git.js";
import { GitError } from "../../../git/error.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { isExpectedError } from "../../../util/is-expected-error.js";
import type { ScmCommand } from "../../helpers.js";

class BranchDeleteItem implements QuickPickItem {
    get #shortCommit(): string {
        return (this.#ref.commit || "").substr(0, 8);
    }
    get branchName(): string | undefined {
        return this.#ref.name;
    }
    get label(): string {
        return this.branchName || "";
    }
    get description(): string {
        return this.#shortCommit;
    }

    #ref: Ref;

    constructor(ref: Ref) {
        this.#ref = ref;
    }

    async run(repository: AbstractRepository, force?: boolean): Promise<void> {
        if (!this.branchName) {
            return;
        }
        await repository.deleteBranch(this.branchName, force);
    }
}

export function createCommand(): ScmCommand {
    async function deleteBranch(repository: AbstractRepository, branchName: string, force?: boolean): Promise<void> {
        let normalisedBranchName = branchName;
        let run: (force?: boolean) => Promise<void>;
        if (typeof normalisedBranchName === "string") {
            run = (force): Promise<void> => repository.deleteBranch(normalisedBranchName, force);
        } else {
            const currentHead = repository.HEAD && repository.HEAD.name;
            const heads = repository.refs.filter(ref => ref.type === RefType.Head && ref.name !== currentHead)
                .map(ref => new BranchDeleteItem(ref));

            const placeHolder = i18n.Translations.selectBranchToDelete();
            const choice = await window.showQuickPick<BranchDeleteItem>(heads, { placeHolder });

            if (!choice || !choice.branchName) {
                return;
            }
            normalisedBranchName = choice.branchName;
            run = (force): Promise<void> => choice.run(repository, force);
        }

        try {
            await run(force);
        } catch (err) {
            if (!isExpectedError(err, GitError, e => e.gitErrorCode === GitErrorCodes.BranchNotFullyMerged)) {
                throw err;
            }

            const message = i18n.Translations.confirmForceDeleteBranch(normalisedBranchName);
            const yes = i18n.Translations.deleteBranch();
            const pick = await window.showWarningMessage(message, { modal: true }, yes);

            if (pick === yes) {
                await run(true);
            }
        }
    }

    return {
        commandId: "git.deleteBranch",
        method: deleteBranch,
        options: {
            repository: true,
        },
    };
}
