import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { Disposable, type Event, EventEmitter, type OutputChannel, Uri } from "vscode";
import { watch } from "./watch.js";

class DotGitEventEmitter extends EventEmitter<Uri> {
    #lastGitIndexDigest: string|null = null;
    #gitIndexPath: string;
    #outputChannel: OutputChannel;

    constructor(dotGitDir: string, outputChannel: OutputChannel) {
        super();
        this.#gitIndexPath = path.join(dotGitDir, "index");
        this.#outputChannel = outputChannel;
    }

    override fire(data: Uri): void {
        if (data.fsPath === this.#gitIndexPath) {
            this.#maybeFireIndexChange(data);
            return;
        }
        super.fire(data);
    }

    async #maybeFireIndexChange(data: Uri): Promise<void> {
        const currentIndexBuffer = await fs.readFile(this.#gitIndexPath);
        const currentIndexDigest = crypto.hash("SHA-1", currentIndexBuffer);

        if (currentIndexDigest === this.#lastGitIndexDigest) {
            // Index content most likely unchanged
            this.#outputChannel.appendLine("Index file content appears unchanged, skipping event.");
            return;
        }

        this.#lastGitIndexDigest = currentIndexDigest;
        super.fire(data);
    }
}

// Watch specific files for meaningful git events
// This is a lot more efficient then watching everything, and avoids workarounds for aids like watchman as an fsmonitor
export function createDotGitWatcher(
    dotGitDir: string,
    outputChannel: OutputChannel,
): { event: Event<Uri> } & Disposable {
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
            // NOTE: Directories are listed individually so ".git/refs/prefetch" (from `git maintenance`) is ignored.
            path.join(dotGitDir, "refs/heads"),
            path.join(dotGitDir, "refs/remotes"),
            path.join(dotGitDir, "refs/tags"),
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
        () => false,
        [],
        outputChannel,
        "dot-git",
    );

    const emitter = new DotGitEventEmitter(dotGitDir, outputChannel);
    const disposable = Disposable.from(rootWatcher, emitter);

    rootWatcher.event((uri) => emitter.fire(uri));

    return {
        dispose: () => disposable.dispose(),
        event: emitter.event,
    };
}
