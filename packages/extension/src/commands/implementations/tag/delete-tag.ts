import { QuickPickItem, window } from "vscode";
import { Ref, RefType } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand {
    async function deleteTag(repository: AbstractRepository): Promise<void> {
        const picks = repository.refs.filter(ref => ref.type === RefType.Tag)
            .map(ref => new TagItem(ref));

        if (picks.length === 0) {
            window.showWarningMessage(i18n.Translations.noTags());
            return;
        }

        const placeHolder = i18n.Translations.selectTagToDelete();
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
