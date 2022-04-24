import { window } from "vscode";
import type { Model } from "../../../model.js";
import { pickRemoteSource } from "../../../remoteSource.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import * as i18n from "../../../i18n/mod.js";
import type { ScmCommand } from "../../helpers.js";

export async function addRemote(
    model: Model,
    repository: AbstractRepository,
): Promise<string | void> {
    const url = await pickRemoteSource(model, {
        providerLabel: provider => i18n.Translations.addRemoteFrom(provider.name),
        urlLabel: i18n.Translations.addRemoteFromLabel(),
    });

    if (!url) {
        return;
    }

    const resultName = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder: i18n.Translations.remoteName(),
        prompt: i18n.Translations.provideRemoteName(),
        validateInput: (name: string) => {
            if (!sanitizeRemoteName(name)) {
                return i18n.Translations.remoteNameFormatInvalid();
            } else if (repository.remotes.find(r => r.name === name)) {
                return i18n.Translations.remoteAlreadyExists(name);
            }

            return null;
        },
    });

    const name = sanitizeRemoteName(resultName || "");

    if (!name) {
        return;
    }

    await repository.addRemote(name, url.trim());
    await repository.fetch({ remote: name });
    return name;
}

export function createCommand(
    model: Model,
): ScmCommand {
    async function addRemoteFn(repository: AbstractRepository): Promise<string | void> {
        await addRemote(model, repository);
    }

    return {
        commandId: "git.addRemote",
        method: addRemoteFn,
        options: {
            repository: true,
        },
    };
}

export function sanitizeRemoteName(name: string): string {
    const trimmedName = name.trim();
    return trimmedName
        && trimmedName.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, "-");
}
