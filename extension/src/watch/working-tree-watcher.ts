import path from "node:path";
import { Disposable, type Event, EventEmitter, type OutputChannel, Uri } from "vscode";
import { anyEvent } from "../util/events.js";
import { watch } from "./watch.js";

export function createWorkingTreeWatcher(
    repoRoot: string,
    dotGit: string,
    outputChannel: OutputChannel,
): { event: Event<Uri> } & Disposable {
    const emitter = new EventEmitter<Uri>();

    const rootWatcher = watch(
        [
            repoRoot,
        ],
        [
            // Don't propagate events if index being modified
            path.join(dotGit, "index.lock"),
            // Or (merge|revert|cherrypick) is in progress
            // TODO Refreshing during a merge/revert/cherrypick produces a lot of noise and puts
            //      extra stress on the system. Not ideal but better for large repos.
            //      Eventually this should be made smarter.
            path.join(dotGit, "MERGE_HEAD"),
            path.join(dotGit, "REVERT_HEAD"),
            path.join(dotGit, "CHERRY_PICK_HEAD"),
        ],
        [
            path.join(dotGit, '.git'),
            // TODO Cull watched list using `.gitignore` (which will involve recreating the watcher
            //      in some circumstances) e.g. for `node_modules`
        ],
        outputChannel,
    );

    const disposable = Disposable.from(
        emitter,
        rootWatcher,
    );

    return {
        dispose: () => disposable.dispose(),
        event: anyEvent(rootWatcher.event, emitter.event),
    };
}
