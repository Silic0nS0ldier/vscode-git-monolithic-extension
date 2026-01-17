import { type OutputChannel, type SourceControlResourceState, Uri } from "vscode";
import type { Model } from "../../../../model.js";
import { Resource } from "../../../../repository/Resource.js";
import { makeCommandId, type ScmCommand } from "../../../helpers.js";
import { getSCMResource } from "../../../helpers.js";

export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function openChange(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
        let resources: Resource[] | undefined = undefined;

        if (arg instanceof Uri) {
            const resource = getSCMResource(model, outputChannel, arg);
            if (resource !== undefined) {
                resources = [resource];
            }
        } else {
            let resource: Resource | undefined = undefined;

            if (arg instanceof Resource) {
                resource = arg;
            } else {
                resource = getSCMResource(model, outputChannel);
            }

            if (resource) {
                resources = [...resourceStates as Resource[], resource];
            }
        }

        if (!resources) {
            return;
        }

        for (const resource of resources) {
            await resource.state.openChange();
        }
    }

    return {
        commandId: makeCommandId("openChange"),
        method: openChange,
        options: {},
    };
}
