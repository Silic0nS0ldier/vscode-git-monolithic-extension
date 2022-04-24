import { window } from "vscode";
import { GitErrorCodes } from "../../../api/git.js";
import { GitError } from "../../../git/error.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";
import { promptForBranchName } from "./helpers.js";

export function createCommand(): ScmCommand {
    async function renameBranch(repository: AbstractRepository): Promise<void> {
        const currentBranchName = repository.HEAD && repository.HEAD.name;
        const branchName = await promptForBranchName(undefined, currentBranchName);

        if (!branchName) {
            return;
        }

        try {
            await repository.renameBranch(branchName);
        } catch (err) {
            if (err instanceof GitError) {
                switch (err.gitErrorCode) {
                    case GitErrorCodes.InvalidBranchName:
                        window.showErrorMessage(i18n.Translations.invalidBranchName());
                        return;
                    case GitErrorCodes.BranchAlreadyExists:
                        window.showErrorMessage(
                            i18n.Translations.branchAlreadyExists(branchName),
                        );
                        return;
                    default:
                        throw new Error("Unexpected issue while attempting branch rename", { cause: err });
                }
            }
            throw err;
        }
    }

    return {
        commandId: "git.renameBranch",
        method: renameBranch,
        options: {
            repository: true,
        },
    };
}
