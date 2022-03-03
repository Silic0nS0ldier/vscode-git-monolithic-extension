import { window } from "vscode";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function createTag(repository: FinalRepository): Promise<void> {
        const inputTagName = await window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: localize("tag name", "Tag name"),
            prompt: localize("provide tag name", "Please provide a tag name"),
        });

        if (!inputTagName) {
            return;
        }

        const inputMessage = await window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: localize("tag message", "Message"),
            prompt: localize("provide tag message", "Please provide a message to annotate the tag"),
        });

        const name = inputTagName.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$/g, "-");
        await repository.tag(name, inputMessage);
    }

    return {
        commandId: "git.createTag",
        method: createTag,
        options: {
            repository: true,
        },
    };
}
