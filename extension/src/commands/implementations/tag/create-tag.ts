import { window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function createTag(repository: AbstractRepository): Promise<void> {
        const inputTagName = await window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: i18n.Translations.tagName(),
            prompt: i18n.Translations.provideTagName(),
        });

        if (!inputTagName) {
            return;
        }

        const inputMessage = await window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: i18n.Translations.tagMessage(),
            prompt: i18n.Translations.provideTagMessage(),
        });

        const name = inputTagName.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, "-");
        await repository.tag(name, inputMessage);
    }

    return {
        commandId: makeCommandId("createTag"),
        method: createTag,
        options: {
            repository: true,
        },
    };
}
