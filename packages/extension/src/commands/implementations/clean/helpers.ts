import { window } from "vscode";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { Resource } from "../../../repository/Resource.js";
import * as i18n from "../../../i18n/mod.js";

export async function cleanUntrackedChanges(
    repository: AbstractRepository,
    resources: readonly Resource[],
): Promise<void> {
    const message = i18n.Translations.confirmDelete(resources);
    const yes = i18n.Translations.deleteFiles();
    const pick = await window.showWarningMessage(message, { modal: true }, yes);

    if (pick !== yes) {
        return;
    }

    await repository.clean(resources.map(r => r.state.resourceUri));
}

export async function cleanUntrackedChange(repository: AbstractRepository, resource: Resource): Promise<void> {
    const message = i18n.Translations.confirmDelete([resource]);
    const yes = i18n.Translations.deleteFile();
    const pick = await window.showWarningMessage(message, { modal: true }, yes);

    if (pick !== yes) {
        return;
    }

    await repository.clean([resource.state.resourceUri]);
}

export async function cleanTrackedChanges(
    repository: AbstractRepository,
    resources: readonly Resource[],
): Promise<void> {
    const message = i18n.Translations.cleanTrackedChanges(resources);
    const yes = i18n.Translations.discardTracked(resources);
    const pick = await window.showWarningMessage(message, { modal: true }, yes);

    if (pick !== yes) {
        return;
    }

    await repository.clean(resources.map(r => r.state.resourceUri));
}
