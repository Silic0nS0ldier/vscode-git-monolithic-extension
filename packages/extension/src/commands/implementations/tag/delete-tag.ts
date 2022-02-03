import { QuickPickItem, window } from "vscode";
import { Ref, RefType } from "../../../api/git.js";
import { Repository } from "../../../repository.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function deleteTag(repository: Repository): Promise<void> {
        const picks = repository.refs.filter(ref => ref.type === RefType.Tag)
            .map(ref => new TagItem(ref));

        if (picks.length === 0) {
            window.showWarningMessage(localize("no tags", "This repository has no tags."));
            return;
        }

        const placeHolder = localize("select a tag to delete", "Select a tag to delete");
        const choice = await window.showQuickPick(picks, { placeHolder });

        if (!choice) {
            return;
        }

        await repository.deleteTag(choice.label);
    }

    return {
        commandId: "git.deleteTag",
        method: deleteTag,
        options: {
            repository: true,
        },
    };
}

class TagItem implements QuickPickItem {
    get label(): string {
        return this.ref.name ?? "";
    }
    get description(): string {
        return this.ref.commit?.substr(0, 8) ?? "";
    }
    constructor(readonly ref: Ref) {}
}
