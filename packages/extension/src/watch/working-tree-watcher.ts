import * as fs from "node:fs";
import path from "node:path";
import { Disposable, Event, RelativePattern, Uri, workspace } from "vscode";
import { anyEvent, filterEvent } from "../util/events.js";

export function createWorkingTreeWatcher(
    repoRoot: string,
    dotGit: string,
): { event: Event<Uri> } & Disposable {
    const indexLockPath = path.join(dotGit, "index.lock");
    const repoWatcher = workspace.createFileSystemWatcher(new RelativePattern(repoRoot, "**"));

    const onRepoFileChange = anyEvent(
        repoWatcher.onDidChange,
        repoWatcher.onDidCreate,
        repoWatcher.onDidDelete,
    );

    const onWorkingTreeFileChange = filterEvent(
        onRepoFileChange,
        uri => {
            if (/\/\.git($|\/)/.test(uri.path)) {
                return false;
            }

            return !fs.existsSync(indexLockPath);
        },
    );

    return {
        dispose() {
            repoWatcher.dispose();
        },
        event: onWorkingTreeFileChange,
    };
}
