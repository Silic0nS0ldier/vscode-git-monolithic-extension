import path from "node:path";
import { Disposable, Event, EventEmitter, OutputChannel, Uri } from "vscode";
import { Repository } from "../repository.js";
import { anyEvent } from "../util.js";
import { watch } from "../watch.js";

export function createDotGitWatcher(
    repository: Repository,
    outputChannel: OutputChannel,
): { event: Event<Uri> } & Disposable {
    const emitter = new EventEmitter<Uri>();

    // Watch specific files for meaningful git events
    // This is a lot more efficient then watching everything, and avoids workarounds for aids like watchman as an fsmonitor
    const rootWatcher = watch(
        [
            // Where we are
            path.join(repository.dotGit, "HEAD"),
            // What we are tracking
            path.join(repository.dotGit, "index"),
            // Graph of what we know
            path.join(repository.dotGit, "refs"),
            // Current commit message
            path.join(repository.dotGit, "COMMIT_EDITMSG"),
            // How we do things
            path.join(repository.dotGit, "config"),
        ],
        // Don't propagate events if index being modified
        [path.join(repository.dotGit, "index.lock")],
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
