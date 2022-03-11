import * as path from "node:path";
import { OutputChannel, Uri, window } from "vscode";
import { Status } from "../../../api/git.js";
import type { Model } from "../../../model.js";
import { Resource } from "../../../repository/Resource.js";
import { ResourceGroupType } from "../../../repository/ResourceGroupType.js";
import { localize } from "../../../util.js";
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
        let yes = localize("discard", "Discard Changes");

        if (scmResources.length === 1) {
            if (untrackedCount > 0) {
                message = localize(
                    "confirm delete",
                    "Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.",
                    path.basename(scmResources[0].state.resourceUri.fsPath),
                );
                yes = localize("delete file", "Delete file");
            } else {
                if (scmResources[0].state.type === Status.DELETED) {
                    yes = localize("restore file", "Restore file");
                    message = localize(
                        "confirm restore",
                        "Are you sure you want to restore {0}?",
                        path.basename(scmResources[0].state.resourceUri.fsPath),
                    );
                } else {
                    message = localize(
                        "confirm discard",
                        "Are you sure you want to discard changes in {0}?",
                        path.basename(scmResources[0].state.resourceUri.fsPath),
                    );
                }
            }
        } else {
            if (scmResources.every(resource => resource.state.type === Status.DELETED)) {
                yes = localize("restore files", "Restore files");
                message = localize(
                    "confirm restore multiple",
                    "Are you sure you want to restore {0} files?",
                    scmResources.length,
                );
            } else {
                message = localize(
                    "confirm discard multiple",
                    "Are you sure you want to discard changes in {0} files?",
                    scmResources.length,
                );
            }

            if (untrackedCount > 0) {
                message = `${message}\n\n${
                    localize(
                        "warn untracked",
                        "This will DELETE {0} untracked files!\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST.",
                        untrackedCount,
                    )
                }`;
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
