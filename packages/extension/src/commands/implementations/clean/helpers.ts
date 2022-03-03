import * as path from "node:path";
import { window } from "vscode";
import { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import { Resource } from "../../../repository/Resource.js";
import { localize } from "../../../util.js";

export async function cleanUntrackedChanges(repository: AbstractRepository, resources: Resource[]): Promise<void> {
    const message = localize(
        "confirm delete multiple",
        "Are you sure you want to DELETE {0} files?\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST if you proceed.",
        resources.length,
    );
    const yes = localize("delete files", "Delete Files");
    const pick = await window.showWarningMessage(message, { modal: true }, yes);

    if (pick !== yes) {
        return;
    }

    await repository.clean(resources.map(r => r.resourceUri));
}

export async function cleanUntrackedChange(repository: AbstractRepository, resource: Resource): Promise<void> {
    const message = localize(
        "confirm delete",
        "Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.",
        path.basename(resource.resourceUri.fsPath),
    );
    const yes = localize("delete file", "Delete file");
    const pick = await window.showWarningMessage(message, { modal: true }, yes);

    if (pick !== yes) {
        return;
    }

    await repository.clean([resource.resourceUri]);
}

export async function cleanTrackedChanges(repository: AbstractRepository, resources: Resource[]): Promise<void> {
    const message = resources.length === 1
        ? localize(
            "confirm discard all single",
            "Are you sure you want to discard changes in {0}?",
            path.basename(resources[0].resourceUri.fsPath),
        )
        : localize(
            "confirm discard all",
            "Are you sure you want to discard ALL changes in {0} files?\nThis is IRREVERSIBLE!\nYour current working set will be FOREVER LOST if you proceed.",
            resources.length,
        );
    const yes = resources.length === 1
        ? localize("discardAll multiple", "Discard 1 File")
        : localize("discardAll", "Discard All {0} Files", resources.length);
    const pick = await window.showWarningMessage(message, { modal: true }, yes);

    if (pick !== yes) {
        return;
    }

    await repository.clean(resources.map(r => r.resourceUri));
}
