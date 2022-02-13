import path from "node:path";
import { Disposable, Event, EventEmitter, OutputChannel, Uri } from "vscode";
import { anyEvent } from "../util.js";
import { watch } from "../watch.js";

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
            path.join(dotGitDir, "index"),
            // Graph of what we know
            path.join(dotGitDir, "refs"),
            // Current commit message
            path.join(dotGitDir, "COMMIT_EDITMSG"),
            // How we do things
            path.join(dotGitDir, "config"),
        ],
        // Don't propagate events if index being modified
        [path.join(dotGitDir, "index.lock")],
        outputChannel,
    );

    const disposable = Disposable.from(
        emitter,
        rootWatcher,
    );

    return {
        event: anyEvent(rootWatcher.event, emitter.event),
        dispose: () => disposable.dispose(),
    };
}
