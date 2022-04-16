import { window, workspace } from "vscode";
import type { Repository } from "../../git.js";
import * as i18n from "../../i18n/mod.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function checkIfMaybeRebased(
    run: RunFn<boolean>,
    repository: Repository,
    currentBranch?: string,
) {
    const config = workspace.getConfiguration("git");
    const shouldIgnore = config.get<boolean>("ignoreRebaseWarning") === true;

    if (shouldIgnore) {
        return true;
    }

    const maybeRebased = await run(Operation.Log, async () => {
        try {
            const result = await repository.exec([
                "log",
                "--oneline",
                "--cherry",
                `${currentBranch ?? ""}...${currentBranch ?? ""}@{upstream}`,
                "--",
            ]);
            if (result.exitCode) {
                return false;
            }

            return /^=/.test(result.stdout);
        } catch {
            return false;
        }
    });

    if (!maybeRebased) {
        return true;
    }

    const always = { title: i18n.Translations.alwaysPull() };
    const pull = { title: i18n.Translations.pull() };
    const cancel = { title: i18n.Translations.dontPull() };
    const result = await window.showWarningMessage(
        i18n.Translations.pullMaybeRebased(currentBranch),
        always,
        pull,
        cancel,
    );

    if (result === pull) {
        return true;
    }

    if (result === always) {
        await config.update("ignoreRebaseWarning", true, true);

        return true;
    }

    return false;
}
