import * as gitErrors from "monolithic-git-interop/errors";
import path from "node:path";
import { inspect } from "node:util";
import { commands, window } from "vscode";
import { makeCommandId } from "../../commands/helpers.js";
import * as i18n from "../../i18n/mod.js";
import { error } from "../../tracing.js";
import type { SourceControlResourceGroupUI } from "../../ui/source-control.js";
import * as config from "../../util/config.js";

/** Reports the outcome of each untracked files lookup, notifying once per run of failures. */
export type UntrackedFailureReporter = {
    readonly failed: (reason: unknown) => void;
    readonly succeeded: () => void;
};

function isTimeout(reason: unknown): boolean {
    const seen = new Set<unknown>();
    let current = reason;
    while (typeof current === "object" && current !== null && !seen.has(current)) {
        seen.add(current);
        if ("type" in current && current.type === gitErrors.ERROR_TIMEOUT) {
            return true;
        }
        current = "cause" in current ? current.cause : undefined;
    }
    return false;
}

export function createUntrackedFailureReporter(
    repoRoot: string,
    untrackedGroup: SourceControlResourceGroupUI,
): UntrackedFailureReporter {
    let notified = false;

    return {
        failed(reason): void {
            error(`Listing the untracked files of '${repoRoot}' failed; ex=${inspect(reason)}`);
            untrackedGroup.setRefreshFailed(true);

            // Autorefresh would otherwise repeat the notification for as long as the lookup keeps failing.
            if (notified) {
                return;
            }
            notified = true;

            const name = path.basename(repoRoot);
            const message = isTimeout(reason)
                ? i18n.Translations.untrackedRefreshTimedOut(name, config.commandTimeout() / 1000)
                : i18n.Translations.untrackedRefreshFailed(name);
            const openGitLog = i18n.Translations.openGitLog();
            void window.showWarningMessage(message, openGitLog).then(choice => {
                if (choice === openGitLog) {
                    void commands.executeCommand(makeCommandId("showOutput"));
                }
            });
        },
        succeeded(): void {
            notified = false;
            untrackedGroup.setRefreshFailed(false);
        },
    };
}
