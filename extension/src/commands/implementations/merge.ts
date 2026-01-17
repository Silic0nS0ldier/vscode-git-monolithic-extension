import { type QuickPickItem, window } from "vscode";
import { type Branch, type Ref, RefType } from "../../api/git.js";
import * as i18n from "../../i18n/mod.js";
import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import * as config from "../../util/config.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

class MergeItem implements QuickPickItem {
    get label(): string {
        return this.ref.name || "";
    }
    get description(): string {
        return this.ref.name || "";
    }

    constructor(protected ref: Ref) {}

    async run(repository: AbstractRepository): Promise<void> {
        await repository.merge(this.ref.name! || this.ref.commit!);
    }
}

export function createCommand(): ScmCommand {
    async function merge(repository: AbstractRepository): Promise<void> {
        const checkoutType = config.checkoutType();
        const includeRemotes = checkoutType === "all" || checkoutType === "remote" || checkoutType?.includes("remote");

        const heads = repository.refs.filter(ref => ref.type === RefType.Head)
            .filter(ref => ref.name || ref.commit)
            .map(ref => new MergeItem(ref as Branch));

        const remoteHeads = (includeRemotes ? repository.refs.filter(ref => ref.type === RefType.RemoteHead) : [])
            .filter(ref => ref.name || ref.commit)
            .map(ref => new MergeItem(ref as Branch));

        const picks = [...heads, ...remoteHeads];
        const placeHolder = i18n.Translations.selectBranchToMerge();
        const choice = await window.showQuickPick<MergeItem>(picks, { placeHolder });

        if (!choice) {
            return;
        }

        await choice.run(repository);
    }

    return {
        commandId: makeCommandId("merge"),
        method: merge,
        options: {
            repository: true,
        },
    };
}
