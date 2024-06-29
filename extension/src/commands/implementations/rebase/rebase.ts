import { type QuickPickItem, window } from "vscode";
import { type Ref, RefType } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as config from "../../../util/config.js";
import type { ScmCommand } from "../../helpers.js";

class RebaseItem implements QuickPickItem {
    get label(): string {
        return this.ref.name || "";
    }
    description: string = "";

    constructor(readonly ref: Ref) {}

    async run(repository: AbstractRepository): Promise<void> {
        if (this.ref?.name) {
            await repository.rebase(this.ref.name);
        }
    }
}

export function createCommand(): ScmCommand {
    async function rebase(repository: AbstractRepository): Promise<void> {
        const checkoutType = config.checkoutType();
        const includeRemotes = checkoutType === "all" || checkoutType === "remote" || checkoutType?.includes("remote");

        const heads = repository.refs.filter(ref => ref.type === RefType.Head)
            .filter(ref => ref.name !== repository.HEAD?.name)
            .filter(ref => ref.name || ref.commit);

        const remoteHeads = (includeRemotes ? repository.refs.filter(ref => ref.type === RefType.RemoteHead) : [])
            .filter(ref => ref.name || ref.commit);

        const picks = [...heads, ...remoteHeads]
            .map(ref => new RebaseItem(ref));

        // set upstream branch as first
        if (repository.HEAD?.upstream) {
            const upstreamName = `${repository.HEAD?.upstream.remote}/${repository.HEAD?.upstream.name}`;
            const index = picks.findIndex(e => e.ref.name === upstreamName);

            if (index > -1) {
                const [ref] = picks.splice(index, 1);
                ref.description = "(upstream)";
                picks.unshift(ref);
            }
        }

        const placeHolder = i18n.Translations.selectRebaseTarget();
        const choice = await window.showQuickPick<RebaseItem>(picks, { placeHolder });

        if (!choice) {
            return;
        }

        await choice.run(repository);
    }

    return {
        commandId: "git.rebase",
        method: rebase,
        options: {
            repository: true,
        },
    };
}
