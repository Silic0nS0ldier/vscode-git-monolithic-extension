import { window } from "vscode";
import { Model } from "../../../model.js";
import { pickRemoteSource } from "../../../remoteSource.js";
import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { localize } from "../../../util.js";
import { ScmCommand } from "../../helpers.js";

export async function addRemote(
    model: Model,
    repository: FinalRepository,
): Promise<string | void> {
    const url = await pickRemoteSource(model, {
        providerLabel: provider => localize("addfrom", "Add remote from {0}", provider.name),
        urlLabel: localize("addFrom", "Add remote from URL"),
    });

    if (!url) {
        return;
    }

    const resultName = await window.showInputBox({
        placeHolder: localize("remote name", "Remote name"),
        prompt: localize("provide remote name", "Please provide a remote name"),
        ignoreFocusOut: true,
        validateInput: (name: string) => {
            if (!sanitizeRemoteName(name)) {
                return localize("remote name format invalid", "Remote name format invalid");
            } else if (repository.remotes.find(r => r.name === name)) {
                return localize("remote already exists", "Remote '{0}' already exists.", name);
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
    async function addRemoteFn(repository: FinalRepository): Promise<string | void> {
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

export function sanitizeRemoteName(name: string) {
    name = name.trim();
    return name && name.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, "-");
}
