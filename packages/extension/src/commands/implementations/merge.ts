import { QuickPickItem, window, workspace } from "vscode";
import { Branch, Ref, RefType } from "../../api/git.js";
import type { AbstractRepository } from "../../repository/repository-class/AbstractRepository.js";
import { localize } from "../../util.js";
import type { ScmCommand } from "../helpers.js";

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
        const config = workspace.getConfiguration("git");
        const checkoutType = config.get<string | string[]>("checkoutType");
        const includeRemotes = checkoutType === "all" || checkoutType === "remote" || checkoutType?.includes("remote");

        const heads = repository.refs.filter(ref => ref.type === RefType.Head)
            .filter(ref => ref.name || ref.commit)
            .map(ref => new MergeItem(ref as Branch));

        const remoteHeads = (includeRemotes ? repository.refs.filter(ref => ref.type === RefType.RemoteHead) : [])
            .filter(ref => ref.name || ref.commit)
            .map(ref => new MergeItem(ref as Branch));

        const picks = [...heads, ...remoteHeads];
        const placeHolder = localize("select a branch to merge from", "Select a branch to merge from");
        const choice = await window.showQuickPick<MergeItem>(picks, { placeHolder });

        if (!choice) {
            return;
        }

        await choice.run(repository);
    }

    return {
        commandId: "git.merge",
        method: merge,
        options: {
            repository: true,
        },
    };
}
