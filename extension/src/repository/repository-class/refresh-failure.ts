import * as gitErrors from "monolithic-git-interop/errors";
import path from "node:path";
import { inspect } from "node:util";
import { commands, window } from "vscode";
import { makeCommandId } from "../../commands/helpers.js";
import * as i18n from "../../i18n/mod.js";
import { error } from "../../tracing.js";
import type { SourceControlResourceGroupUI } from "../../ui/source-control.js";
import * as config from "../../util/config.js";

/** Reports the outcome of each run of one part of a refresh, notifying once per run of failures. */
export type RefreshFailureReporter = {
    readonly failed: (reason: unknown) => void;
    readonly succeeded: () => void;
};

/** What a failing part of a refresh is called in the log, and the notification for each kind of failure. */
export type RefreshFailureMessages = {
    readonly activity: string;
    readonly failed: (repoName: string) => string;
    readonly timedOut: (repoName: string, timeoutSeconds: number) => string;
};

export const UNTRACKED_FAILURE: RefreshFailureMessages = {
    activity: "Listing the untracked files",
    failed: name => i18n.Translations.untrackedRefreshFailed(name),
    timedOut: (name, seconds) => i18n.Translations.untrackedRefreshTimedOut(name, seconds),
};

export const STATUS_FAILURE: RefreshFailureMessages = {
    activity: "Reading the status",
    failed: name => i18n.Translations.statusRefreshFailed(name),
    timedOut: (name, seconds) => i18n.Translations.statusRefreshTimedOut(name, seconds),
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

/** Flags `groups` as failed to refresh while the part `messages` describes keeps failing. */
export function createRefreshFailureReporter(
    repoRoot: string,
    groups: readonly SourceControlResourceGroupUI[],
    messages: RefreshFailureMessages,
): RefreshFailureReporter {
    let failing = false;

    return {
        failed(reason): void {
            error(`${messages.activity} of '${repoRoot}' failed; ex=${inspect(reason)}`);
            for (const group of groups) {
                group.setRefreshFailed(true);
            }

            // Autorefresh would otherwise repeat the notification for as long as the lookup keeps failing.
            if (failing) {
                return;
            }
            failing = true;

            const name = path.basename(repoRoot);
            const message = isTimeout(reason)
                ? messages.timedOut(name, config.commandTimeout() / 1000)
                : messages.failed(name);
            const openGitLog = i18n.Translations.openGitLog();
            void window.showWarningMessage(message, openGitLog).then(choice => {
                if (choice === openGitLog) {
                    void commands.executeCommand(makeCommandId("showOutput"));
                }
            });
        },
        succeeded(): void {
            if (!failing) {
                return;
            }
            failing = false;
            for (const group of groups) {
                group.setRefreshFailed(false);
            }
        },
    };
}
