import * as path from "node:path";
import { Uri, window } from "vscode";
import { FinalRepository } from "../../repository/repository-class/mod.js";
import { ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function rename(repository: FinalRepository, fromUri: Uri | undefined): Promise<void> {
        const normalisedFromUri = fromUri ?? window.activeTextEditor?.document.uri;

        if (!normalisedFromUri) {
            return;
        }

        const from = path.relative(repository.root, normalisedFromUri.fsPath);
        let to = await window.showInputBox({
            value: from,
            valueSelection: [from.length - path.basename(from).length, from.length],
        });

        to = to?.trim();

        if (!to) {
            return;
        }

        await repository.move(from, to);
    }

    return {
        commandId: "git.rename",
        method: rename,
        options: {
            repository: true,
        },
    };
}
