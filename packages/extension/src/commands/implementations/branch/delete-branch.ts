import { QuickPickItem, window } from "vscode";
import { GitErrorCodes, Ref, RefType } from "../../../api/git.js";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

class BranchDeleteItem implements QuickPickItem {
    private get shortCommit(): string {
        return (this.ref.commit || "").substr(0, 8);
    }
    get branchName(): string | undefined {
        return this.ref.name;
    }
    get label(): string {
        return this.branchName || "";
    }
    get description(): string {
        return this.shortCommit;
    }

    constructor(private ref: Ref) {}

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
            run = force => repository.deleteBranch(normalisedBranchName, force);
        } else {
            const currentHead = repository.HEAD && repository.HEAD.name;
            const heads = repository.refs.filter(ref => ref.type === RefType.Head && ref.name !== currentHead)
                .map(ref => new BranchDeleteItem(ref));

            const placeHolder = localize("select branch to delete", "Select a branch to delete");
            const choice = await window.showQuickPick<BranchDeleteItem>(heads, { placeHolder });

            if (!choice || !choice.branchName) {
                return;
            }
            normalisedBranchName = choice.branchName;
            run = force => choice.run(repository, force);
        }

        try {
            await run(force);
        } catch (err) {
            if (err.gitErrorCode !== GitErrorCodes.BranchNotFullyMerged) {
                throw err;
            }

            const message = localize(
                "confirm force delete branch",
                "The branch '{0}' is not fully merged. Delete anyway?",
                normalisedBranchName,
            );
            const yes = localize("delete branch", "Delete Branch");
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
