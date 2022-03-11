import { window, workspace } from "vscode";
import type { Repository } from "../../git.js";
import { localize } from "../../util.js";
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

    const always = { title: localize("always pull", "Always Pull") };
    const pull = { title: localize("pull", "Pull") };
    const cancel = { title: localize("dont pull", "Don't Pull") };
    const result = await window.showWarningMessage(
        currentBranch
            ? localize(
                "pull branch maybe rebased",
                "It looks like the current branch '{0}' might have been rebased. Are you sure you still want to pull into it?",
                currentBranch,
            )
            : localize(
                "pull maybe rebased",
                "It looks like the current branch might have been rebased. Are you sure you still want to pull into it?",
            ),
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
