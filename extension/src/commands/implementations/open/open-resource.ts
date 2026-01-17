import type { Model } from "../../../model.js";
import type { Resource } from "../../../repository/Resource.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand {
    async function openResource(resource: Resource): Promise<void> {
        const repository = model.getRepository(resource.state.resourceUri);

        if (!repository) {
            return;
        }

        await resource.state.open();
    }

    return {
        commandId: makeCommandId("openResource"),
        method: openResource,
        options: {},
    };
}
