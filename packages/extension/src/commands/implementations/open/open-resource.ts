import { Model } from "../../../model.js";
import { Resource } from "../../../repository/Resource.js";
import { ScmCommand } from "../../helpers.js";

export function createCommand(
    model: Model,
): ScmCommand {
    async function openResource(resource: Resource): Promise<void> {
        const repository = model.getRepository(resource.resourceUri);

        if (!repository) {
            return;
        }

        await resource.open();
    }

    return {
        commandId: "git.openResource",
        method: openResource,
        options: {},
    };
}
