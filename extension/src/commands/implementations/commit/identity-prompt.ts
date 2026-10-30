import { window } from "vscode";
import type { CommitIdentity } from "../../../api/git.js";
import * as i18n from "../../../i18n/mod.js";
import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";

export type CommitIdentityChoice = {
    /** `once` commits as `identity` without saving it; the others save it to that config first. */
    action: "once" | "local" | "global";
    identity: CommitIdentity;
};

async function askFor(prompt: string, placeHolder: string, value: string | undefined): Promise<string | undefined> {
    const answer = await window.showInputBox({
        ignoreFocusOut: true,
        placeHolder,
        prompt,
        validateInput: input => input.trim() === "" ? i18n.Translations.identityValueRequired() : undefined,
        value,
    });

    return answer?.trim();
}

/**
 * Asks who to commit as, prefilled with whatever git already knows, and whether to save it.
 * Resolves to undefined when the user backs out at any step.
 */
export async function promptForCommitIdentity(
    repository: AbstractRepository,
): Promise<CommitIdentityChoice | undefined> {
    const known = await repository.getIdentity();

    const name = await askFor(
        i18n.Translations.identityNamePrompt(),
        i18n.Translations.identityNamePlaceholder(),
        known.name,
    );
    if (!name) {
        return undefined;
    }

    const email = await askFor(
        i18n.Translations.identityEmailPrompt(),
        i18n.Translations.identityEmailPlaceholder(),
        known.email,
    );
    if (!email) {
        return undefined;
    }

    const once = i18n.Translations.commitIdentityOnce();
    const local = i18n.Translations.saveIdentityToRepository();
    const global = i18n.Translations.saveIdentityToUser();
    const pick = await window.showInformationMessage(
        i18n.Translations.confirmCommitIdentity(name, email),
        { detail: i18n.Translations.confirmCommitIdentityDetail(), modal: true },
        once,
        local,
        global,
    );

    const identity = { email, name };
    switch (pick) {
        case once:
            return { action: "once", identity };
        case local:
            return { action: "local", identity };
        case global:
            return { action: "global", identity };
        default:
            return undefined;
    }
}
