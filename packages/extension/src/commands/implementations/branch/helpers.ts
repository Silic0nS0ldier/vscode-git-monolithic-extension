import { window, workspace } from "vscode";
import { localize } from "../../../util.js";

export async function promptForBranchName(defaultName?: string, initialValue?: string): Promise<string> {
	const config = workspace.getConfiguration('git');
	const branchWhitespaceChar = config.get<string>('branchWhitespaceChar')!;
	const branchValidationRegex = config.get<string>('branchValidationRegex')!;
	const sanitize = (name: string) => name ?
		name.trim().replace(/^-+/, '').replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, branchWhitespaceChar)
		: name;

	const rawBranchName = defaultName || await window.showInputBox({
		placeHolder: localize('branch name', "Branch name"),
		prompt: localize('provide branch name', "Please provide a new branch name"),
		value: initialValue,
		ignoreFocusOut: true,
		validateInput: (name: string) => {
			const validateName = new RegExp(branchValidationRegex);
			if (validateName.test(sanitize(name))) {
				return null;
			}

			return localize('branch name format invalid', "Branch name needs to match regex: {0}", branchValidationRegex);
		}
	});

	return sanitize(rawBranchName || '');
}