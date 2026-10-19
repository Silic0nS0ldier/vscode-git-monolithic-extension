import { ProgressLocation, Uri, window } from "vscode";
import { GitError } from "../../git/error.js";
import * as i18n from "../../i18n/mod.js";
import { fromCancellationToken } from "../../util/abort-signal-adapters.js";
import * as config from "../../util/config.js";

/**
 * When `supportCancellation` is on, shows a cancellable notification from the moment a sync is requested, so it can
 * also be cancelled while waiting for other remote operations.
 */
export async function withSyncCancellation(
    repoRoot: string,
    sync: (signal?: AbortSignal) => Promise<void>,
): Promise<void> {
    if (!config.supportCancellation(Uri.file(repoRoot))) {
        return sync();
    }

    const opts = {
        cancellable: true,
        location: ProgressLocation.Notification,
        title: i18n.Translations.syncIsUnpredictable(),
    };

    await window.withProgress(opts, async (_, token) => {
        const signal = fromCancellationToken(token);
        try {
            await sync(signal);
        } catch (err) {
            throw signal.aborted ? new GitError({ message: "Cancelled" }) : err;
        }
    });
}
