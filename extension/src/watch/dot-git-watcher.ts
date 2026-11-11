import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import { Disposable, type Event, EventEmitter, Uri } from "vscode";
import { error, trace } from "../tracing.js";
import { transientGitLocks } from "./lock-gate.js";
import { type SuspendHandle, watch } from "./watch.js";

class DotGitEventEmitter extends EventEmitter<Uri> {
    #lastGitIndexDigest: string | null = null;
    #gitIndexPath: string;

    constructor(dotGitDir: string) {
        super();
        this.#gitIndexPath = path.join(dotGitDir, "index");
    }

    override fire(data: Uri): void {
        if (data.fsPath === this.#gitIndexPath) {
            this.#maybeFireIndexChange(data).catch((e) => error(`Failure while handling index change: ${inspect(e)}`));
            return;
        }
        super.fire(data);
    }

    async #maybeFireIndexChange(data: Uri): Promise<void> {
        let currentIndexBuffer: Buffer;
        try {
            currentIndexBuffer = await fs.readFile(this.#gitIndexPath);
        } catch {
            if (this.#lastGitIndexDigest !== null) {
                this.#lastGitIndexDigest = null;
                super.fire(data);
            }
            return;
        }
        const currentIndexDigest = crypto.hash("SHA-1", currentIndexBuffer);

        if (currentIndexDigest === this.#lastGitIndexDigest) {
            // Index content most likely unchanged
            trace("Index file content appears unchanged, skipping event.");
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
): { event: Event<Uri>; suspend: () => SuspendHandle } & Disposable {
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
        transientGitLocks(dotGitDir),
        () => false,
        [],
        "dot-git",
    );

    const emitter = new DotGitEventEmitter(dotGitDir);
    const disposable = Disposable.from(rootWatcher, emitter);

    rootWatcher.event((uri) => emitter.fire(uri));

    return {
        dispose: () => void disposable.dispose(),
        event: emitter.event,
        suspend: () => rootWatcher.suspend(),
    };
}
