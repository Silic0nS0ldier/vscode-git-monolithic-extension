import path from "node:path";
import { Disposable, type Event, EventEmitter, type OutputChannel, Uri } from "vscode";
import { anyEvent } from "../util/events.js";
import { watch } from "./watch.js";

export function createDotGitWatcher(
    dotGitDir: string,
    outputChannel: OutputChannel,
): { event: Event<Uri> } & Disposable {
    const emitter = new EventEmitter<Uri>();

    // Watch specific files for meaningful git events
    // This is a lot more efficient then watching everything, and avoids workarounds for aids like watchman as an fsmonitor
    const rootWatcher = watch(
        [
            // Where we are
            path.join(dotGitDir, "HEAD"),
            // What we are tracking
            // `sharedindex.*` stores the whole index, with `index` a subset of recent changes. As
            // such `sharedindex.*` does not needed to be watched. Any changes are just `index`
            // being pruned.
            path.join(dotGitDir, "index"),
            // Graph of what we know
            path.join(dotGitDir, "refs"),
            // Current commit message
            path.join(dotGitDir, "COMMIT_EDITMSG"),
            // How we do things
            path.join(dotGitDir, "config"),
        ],
        [
            // Don't propagate events if index being modified
            path.join(dotGitDir, "index.lock"),
            // Or (merge|revert|cherrypick) is in progress
            // TODO Refreshing during a merge/revert/cherrypick produces a lot of noise and puts
            //      extra stress on the system. Not ideal but better for large repos.
            //      Eventually this should be made smarter.
            path.join(dotGitDir, "MERGE_HEAD"),
            path.join(dotGitDir, "REVERT_HEAD"),
            path.join(dotGitDir, "CHERRY_PICK_HEAD"),
        ],
        [],
        outputChannel,
        "dot-git",
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
