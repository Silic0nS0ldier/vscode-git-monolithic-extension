import { window, workspace } from "vscode";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { createCheckoutItems } from "../checkout/helpers.js";
import { HEADItem } from "./quick-pick.js";

export async function promptForBranchName(defaultName?: string, initialValue?: string): Promise<string> {
    const config = workspace.getConfiguration("git");
    const branchWhitespaceChar = config.get<string>("branchWhitespaceChar")!;
    const branchValidationRegex = config.get<string>("branchValidationRegex")!;
    const sanitize = (name: string) =>
        name
            ? name.trim().replace(/^-+/, "").replace(
                /^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g,
                branchWhitespaceChar,
            )
            : name;

    const rawBranchName = defaultName || await window.showInputBox({
        placeHolder: localize("branch name", "Branch name"),
        prompt: localize("provide branch name", "Please provide a new branch name"),
        value: initialValue,
        ignoreFocusOut: true,
        validateInput: (name: string) => {
            const validateName = new RegExp(branchValidationRegex);
            if (validateName.test(sanitize(name))) {
                return null;
            }

            return localize(
                "branch name format invalid",
                "Branch name needs to match regex: {0}",
                branchValidationRegex,
            );
        },
    });

    return sanitize(rawBranchName || "");
}

export async function branch(repository: FinalRepository, defaultName?: string, from = false): Promise<void> {
    const branchName = await promptForBranchName(defaultName);

    if (!branchName) {
        return;
    }

    let target = "HEAD";

    if (from) {
        const picks = [new HEADItem(repository), ...createCheckoutItems(repository)];
        const placeHolder = localize(
            "select a ref to create a new branch from",
            "Select a ref to create the '{0}' branch from",
            branchName,
        );
        const choice = await window.showQuickPick(picks, { placeHolder });

        if (!choice) {
            return;
        }

        target = choice.label;
    }

    await repository.branch(branchName, true, target);
}
