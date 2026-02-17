import path from "node:path";
import util from "node:util";
import { Disposable, type Event, EventEmitter, type OutputChannel, Uri } from "vscode";
import { diffLines, type ChangeObject } from "diff";
import { indexState } from "monolithic-git-interop/api-opaque/index-state";
import { watch } from "./watch.js";
import type { GitContext } from "monolithic-git-interop/cli";
import { isErr, unwrap } from "monolithic-git-interop/util/result";

function renderChangeObject(change: ChangeObject<string>) {
    if (change.added) {
        return `+ ${change.value}`;
    }
    if (change.removed) {
        return `- ${change.value}`;
    }
    return `  ${change.value}`;
}

class DotGitEventEmitter extends EventEmitter<Uri> {
    /**
     * Tracks the last known state of the git index to allow monitoring _exactly_ what changes
     * caused an event (e.g. metadata vs. content changes).
     */
    lastGitIndex: Buffer|null = null;
    #gitIndexPath: string;
    #repositoryPath: string;
    #gitContext: GitContext;
    #outputChannel: OutputChannel;

    constructor(dotGitDir: string, repositoryPath: string, outputChannel: OutputChannel, gitContext: GitContext) {
        super();
        this.#gitIndexPath = path.join(dotGitDir, "index");
        this.#repositoryPath = repositoryPath;
        this.#outputChannel = outputChannel;
        this.#gitContext = gitContext;
    }

    override fire(data: Uri): void {
        if (data.fsPath === this.#gitIndexPath) {
            this.#maybeFireIndexChange(data);
            return;
        }
        super.fire(data);
    }

    async #maybeFireIndexChange(data: Uri): Promise<void> {
        const result = await indexState(this.#gitContext, this.#repositoryPath);

        if (isErr(result)) {
            this.#outputChannel.appendLine(`Failed to read git index: ${util.inspect(unwrap(result))}`);
            this.fire(data);
            return;
        }

        const newIndex = unwrap(result);
        const oldIndex = this.lastGitIndex;

        if (oldIndex == null) {
            this.lastGitIndex = newIndex;
            this.#outputChannel.appendLine("Initial index state recorded");
            super.fire(data);
            return;
        }

        try {
            const diff = diffLines(oldIndex.toString('utf-8'), newIndex.toString('utf-8'));
            if (diff.length > 0) {
                this.#outputChannel.appendLine(`Git index changed with ${diff.length} diff entries`);
                for (const entry of diff.slice(0, 10)) {
                    this.#outputChannel.appendLine(renderChangeObject(entry));
                }
                if (diff.length > 10) {
                    this.#outputChannel.appendLine(`... and ${diff.length - 10} more entries`);
                }
                super.fire(data);
            } else if (oldIndex.equals(newIndex)) {
                // Ideally this won't be needed, but has been included out an abundance of caution while `jsdiff` is vetted.
                // TODO(Silic0nS0ldier): Remove once confidence in `jsdiff` is established.
                this.#outputChannel.appendLine("Git index changed but inspected content is identical");
            } else {
                this.#outputChannel.appendLine("Git index changed but content comparison is inconclusive");
                super.fire(data);
            }
        } catch (err) {
            this.#outputChannel.appendLine(`Failed to diff git index: ${util.inspect(err)}`);
            super.fire(data);
            return;
        }
    }
}

// Watch specific files for meaningful git events
// This is a lot more efficient then watching everything, and avoids workarounds for aids like watchman as an fsmonitor
export function createDotGitWatcher(
    dotGitDir: string,
    repositoryPath: string,
    outputChannel: OutputChannel,
    gitContext: GitContext,
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

    const emitter = new DotGitEventEmitter(dotGitDir, repositoryPath, outputChannel, gitContext);
    const disposable = Disposable.from(rootWatcher, emitter);

    rootWatcher.event((uri) => emitter.fire(uri));

    return {
        dispose: () => disposable.dispose(),
        event: emitter.event,
    };
}
