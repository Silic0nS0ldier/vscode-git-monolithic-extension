import { OutputChannel, SourceControlResourceState, Uri } from "vscode";
import { Model } from "../../model.js";
import { Resource } from "../../repository/Resource.js";
import { ScmCommand } from "../helpers.js";
import { getSCMResource, runByRepository } from "../helpers.js";

export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function ignore(...resourceStates: SourceControlResourceState[]): Promise<void> {
        resourceStates = resourceStates.filter(s => !!s);

        if (resourceStates.length === 0 || (resourceStates[0] && !(resourceStates[0].resourceUri instanceof Uri))) {
            const resource = getSCMResource(model, outputChannel);

            if (!resource) {
                return;
            }

            resourceStates = [resource];
        }

        const resources = resourceStates
            .filter(s => s instanceof Resource)
            .map(r => r.resourceUri);

        if (!resources.length) {
            return;
        }

        await runByRepository(model, resources, async (repository, resources) => repository.ignore(resources));
    }

    return {
        commandId: "git.ignore",
        method: ignore,
        options: {},
    };
}
