import { OutputChannel, Uri, window } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import type { Model } from "../../../model.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import { isCancelledError } from "../../../util/is-cancelled-error.js";
import type { ScmCommand } from "../../helpers.js";
import { getSCMResource, runByRepository } from "../../helpers.js";
import { categorizeResourceByResolution, stageDeletionConflict } from "./helpers.js";

export function createCommand(
    outputChannel: OutputChannel,
    model: Model,
): ScmCommand {
    async function stage(...resourceStates: Resource[]): Promise<void> {
        outputChannel.appendLine(`git.stage ${resourceStates.length}`);

        let normalisedResourceStates = resourceStates.filter(s => !!s);

        if (
            normalisedResourceStates.length === 0
            || (normalisedResourceStates[0] && !(normalisedResourceStates[0].state.resourceUri instanceof Uri))
        ) {
            const resource = getSCMResource(model, outputChannel);

            outputChannel.appendLine(
                `git.stage.getSCMResource ${resource ? resource.state.resourceUri.toString() : null}`,
            );

            if (!resource) {
                return;
            }

            normalisedResourceStates = [resource];
        }

        const selection = normalisedResourceStates.filter(s => s instanceof Resource) as Resource[];
        const { resolved, unresolved, deletionConflicts } = await categorizeResourceByResolution(selection);

        if (unresolved.length > 0) {
            const message = i18n.Translations.confirmStageWithMergeConflicts(unresolved);
            const yes = i18n.Translations.yes();
            const pick = await window.showWarningMessage(message, { modal: true }, yes);

            if (pick !== yes) {
                return;
            }
        }

        try {
            await runByRepository(
                model,
                deletionConflicts.map(r => r.state.resourceUri),
                async (repository, resources) => {
                    for (const resource of resources) {
                        await stageDeletionConflict(repository, resource);
                    }
                },
            );
        } catch (err) {
            if (isCancelledError(err)) {
                return;
            }

            throw err;
        }

        const workingTree = selection.filter(s => s.state.resourceGroupType === ResourceGroupType.WorkingTree);
        const untracked = selection.filter(s => s.state.resourceGroupType === ResourceGroupType.Untracked);
        const scmResources = [...workingTree, ...untracked, ...resolved, ...unresolved];

        outputChannel.appendLine(`git.stage.scmResources ${scmResources.length}`);
        if (!scmResources.length) {
            return;
        }

        const resources = scmResources.map(r => r.state.resourceUri);
        await runByRepository(model, resources, async (repository, resources) => repository.add(resources));
    }

    return {
        commandId: "git.stage",
        method: stage,
        options: {},
    };
}
