import { type OutputChannel } from "vscode";
import type { Model } from "../../../model.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { normaliseResourceStates, runByRepository } from "../../helpers.js";

export function createCommand(
    outputChannel: OutputChannel,
    model: Model,
): ScmCommand {
    async function unstage(...resourceStates: Resource[]): Promise<void> {
        const normalisedResourceStates = normaliseResourceStates(model, outputChannel, resourceStates);

        const scmResources = normalisedResourceStates
            .filter(s => s instanceof Resource && s.state.resourceGroupType === ResourceGroupType.Index) as Resource[];

        if (!scmResources.length) {
            return;
        }

        const resources = scmResources.map(r => r.state.resourceUri);
        await runByRepository(model, resources, async (repository, resources) => repository.revert(resources));
    }

    return {
        commandId: makeCommandId("unstage"),
        method: unstage,
        options: {},
    };
}
