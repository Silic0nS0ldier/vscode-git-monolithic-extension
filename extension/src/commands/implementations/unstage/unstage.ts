import { type OutputChannel, Uri } from "vscode";
import type { Model } from "../../../model.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import type { ScmCommand } from "../../helpers.js";
import { getSCMResource, runByRepository } from "../../helpers.js";

export function createCommand(
    outputChannel: OutputChannel,
    model: Model,
): ScmCommand {
    async function unstage(...resourceStates: Resource[]): Promise<void> {
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

        const scmResources = normalisedResourceStates
            .filter(s => s instanceof Resource && s.state.resourceGroupType === ResourceGroupType.Index) as Resource[];

        if (!scmResources.length) {
            return;
        }

        const resources = scmResources.map(r => r.state.resourceUri);
        await runByRepository(model, resources, async (repository, resources) => repository.revert(resources));
    }

    return {
        commandId: "git.unstage",
        method: unstage,
        options: {},
    };
}
