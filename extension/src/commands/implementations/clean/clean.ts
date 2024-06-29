import { type OutputChannel, Uri, window } from "vscode";
import { Status } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import type { ScmCommand } from "../../helpers.js";
import { getSCMResource, runByRepository } from "../../helpers.js";

export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function clean(...resourceStates: Resource[]): Promise<void> {
        let normalisedResourceStates = resourceStates.filter(s => !!s);

        if (
            normalisedResourceStates.length === 0
            || (normalisedResourceStates[0] && !(normalisedResourceStates[0].state.resourceUri instanceof Uri))
        ) {
            const resource = getSCMResource(model, outputChannel);

            if (!resource) {
                return;
            }

            normalisedResourceStates = [resource];
        }

        const scmResources = normalisedResourceStates.filter(s =>
            s instanceof Resource
            && (s.state.resourceGroupType === ResourceGroupType.WorkingTree
                || s.state.resourceGroupType === ResourceGroupType.Untracked)
        ) as Resource[];

        if (!scmResources.length) {
            return;
        }

        const untrackedCount = scmResources.reduce((s, r) => s + (r.state.type === Status.UNTRACKED ? 1 : 0), 0);
        let message: string;
        let yes = i18n.Translations.discard();

        if (scmResources.length === 1) {
            if (untrackedCount > 0) {
                message = i18n.Translations.confirmDelete(scmResources);
                yes = i18n.Translations.deleteFile();
            } else {
                if (scmResources[0].state.type === Status.DELETED) {
                    yes = i18n.Translations.restoreFile();
                    message = i18n.Translations.confirmRestoreFiles(scmResources);
                } else {
                    message = i18n.Translations.confirmDiscard(scmResources);
                }
            }
        } else {
            if (scmResources.every(resource => resource.state.type === Status.DELETED)) {
                yes = i18n.Translations.restoreFiles();
                message = i18n.Translations.confirmRestoreFiles(scmResources);
            } else {
                message = i18n.Translations.confirmDiscard(scmResources);
            }

            if (untrackedCount > 0) {
                message = `${message}\n\n${i18n.Translations.warnUntracked(untrackedCount)}`;
            }
        }

        const pick = await window.showWarningMessage(message, { modal: true }, yes);

        if (pick !== yes) {
            return;
        }

        const resources = scmResources.map(r => r.state.resourceUri);
        await runByRepository(model, resources, async (repository, resources) => repository.clean(resources));
    }

    return {
        commandId: "git.clean",
        method: clean,
        options: {},
    };
}
