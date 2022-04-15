import path from "node:path";
import { Uri, window, WorkspaceConfiguration } from "vscode";
import type { Repository } from "../../../git.js";
import { localize } from "../../../util.js";
import type { Box } from "../../../util/box.js";
import { findKnownHugeFolderPathsToIgnore } from "../find-known-huge-folder-paths-to-ignore.js";
import { ignore } from "../ignore.js";
import type { RunFn } from "../run.js";

export async function handleLimitHit(
    repoRoot: string,
    run: RunFn<void> & RunFn<Set<string>>,
    repository: Repository,
    config: WorkspaceConfiguration,
    didWarnAboutLimit: Box<boolean>,
) {
    const knownHugeFolderPaths = await findKnownHugeFolderPathsToIgnore(repoRoot, run, repository);
    const gitWarn = localize(
        "huge",
        "The git repository at '{0}' has too many active changes, only a subset of Git features will be enabled.",
        repoRoot,
    );
    const neverAgain = { title: localize("neveragain", "Don't Show Again") };

    if (knownHugeFolderPaths.length > 0) {
        const folderPath = knownHugeFolderPaths[0];
        const folderName = path.basename(folderPath);

        const addKnown = localize("add known", "Would you like to add '{0}' to .gitignore?", folderName);
        const yes = { title: localize("yes", "Yes") };

        const result = await window.showWarningMessage(`${gitWarn} ${addKnown}`, yes, neverAgain);

        if (result === neverAgain) {
            config.update("ignoreLimitWarning", true, false);
            didWarnAboutLimit.set(true);
        } else if (result === yes) {
            ignore(run, repository, [Uri.file(folderPath)]);
        }
    } else {
        const result = await window.showWarningMessage(gitWarn, neverAgain);

        if (result === neverAgain) {
            config.update("ignoreLimitWarning", true, false);
        }

        didWarnAboutLimit.set(true);
    }
}
