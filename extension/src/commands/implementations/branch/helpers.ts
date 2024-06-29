import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import { createCheckoutItems } from "../checkout/helpers.js";
import { HEADItem } from "./quick-pick.js";

export async function promptForBranchName(defaultName?: string, initialValue?: string): Promise<string> {
    const branchWhitespaceChar = config.branchWhitespaceChar();
    const branchValidationRegex = config.branchValidationRegex();
    const sanitize = (name: string): string =>
        name
            ? name.trim().replace(/^-+/, "").replace(
                /^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g,
                branchWhitespaceChar,
            )
            : // TODO Wouldn't this be an empty string?
                name;

    const rawBranchName = defaultName || await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: i18n.Translations.branchName(),
        prompt: i18n.Translations.provideBranchName(),
        validateInput: (name: string) => {
            const validateName = new RegExp(branchValidationRegex);
            if (validateName.test(sanitize(name))) {
                return null;
            }

            return i18n.Translations.branchNameFormatInvalid(
                branchValidationRegex,
            );
        },
        value: initialValue,
    });

    return sanitize(rawBranchName || "");
}

export async function branch(repository: AbstractRepository, defaultName?: string, from = false): Promise<void> {
    const branchName = await promptForBranchName(defaultName);

    if (!branchName) {
        return;
    }

    let target = "HEAD";

    if (from) {
        const picks = [new HEADItem(repository), ...createCheckoutItems(repository)];
        const placeHolder = i18n.Translations.selectRefToBranchFrom(branchName);
        const choice = await window.showQuickPick(picks, { placeHolder });

        if (!choice) {
            return;
        }

        target = choice.label;
    }

    await repository.branch(branchName, true, target);
}
