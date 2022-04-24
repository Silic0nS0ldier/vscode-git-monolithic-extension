import path from "node:path";
import { Uri, window } from "vscode";
import type { Repository } from "../../../git.js";
import * as i18n from "../../../i18n/mod.js";
import type { Box } from "../../../util/box.js";
import * as config from "../../../util/config.js";
import { findKnownHugeFolderPathsToIgnore } from "../find-known-huge-folder-paths-to-ignore.js";
import { ignore } from "../ignore.js";
import type { RunFn } from "../run.js";

export async function handleLimitHit(
    repoRoot: string,
    run: RunFn<void> & RunFn<Set<string>>,
    repository: Repository,
    didWarnAboutLimit: Box<boolean>,
): Promise<void> {
    const knownHugeFolderPaths = await findKnownHugeFolderPathsToIgnore(repoRoot, run, repository);
    const gitWarn = i18n.Translations.tooManyChanges(repoRoot);
    const neverAgain = { title: i18n.Translations.neverAgain() };

    if (knownHugeFolderPaths.length > 0) {
        // TODO This is naive
        const folderPath = knownHugeFolderPaths[0];
        const folderName = path.basename(folderPath);

        const addKnown = i18n.Translations.addKnown(folderName);
        const yes = { title: i18n.Translations.yes() };

        const result = await window.showWarningMessage(`${gitWarn} ${addKnown}`, yes, neverAgain);

        if (result === neverAgain) {
            config.legacy().update("ignoreLimitWarning", true, false);
            didWarnAboutLimit.set(true);
        } else if (result === yes) {
            ignore(run, repository, [Uri.file(folderPath)]);
        }
    } else {
        const result = await window.showWarningMessage(gitWarn, neverAgain);

        if (result === neverAgain) {
            config.legacy().update("ignoreLimitWarning", true, false);
        }

        didWarnAboutLimit.set(true);
    }
}
