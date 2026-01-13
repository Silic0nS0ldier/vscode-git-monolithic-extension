import path from "node:path";
import fs from "node:fs";
import { inspect } from "node:util";
import { Disposable, type Event, type OutputChannel, Uri } from "vscode";
import ignore from "ignore";
import { createIgnoreFnFromList, watch } from "./watch.js";

export function createWorkingTreeWatcher(
    repoRoot: string,
    dotGit: string,
    outputChannel: OutputChannel,
): { event: Event<Uri> } & Disposable {
    const rootGitIgnorePath = path.join(repoRoot, ".gitignore");
    let rootGitIgnoreFn: ignore.Ignore = loadGitIgnore(rootGitIgnorePath, outputChannel);

    const wellKnownIgnoreFn = createIgnoreFnFromList([dotGit]);

    const combinedIgnoreFn = (targetPath: string): boolean => {
        if (wellKnownIgnoreFn(targetPath)) {
            return true;
        }
        const relativePath = path.relative(repoRoot, targetPath);
        if (relativePath === "") {
            // Never ignore the repo root itself (plus `rootGitIgnoreFn` considers "" input invalid)
            return false;
        }
        // TODO No clue how this is happening, but sometimes paths like `/workspaces` and `/` are passed in.
        if (relativePath.startsWith("..")) {
            // Outside of the repo root, don't ignore
            return false;
        }
        try {
            const ignored = rootGitIgnoreFn.ignores(relativePath);
            return ignored;
        } catch (e) {
            outputChannel.appendLine(`ERROR: Path '${targetPath}' triggered an error in 'ignore' package: ` + inspect(e));
        }
        return false;
    };

    const workingTreeWatcher = watch(
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
        combinedIgnoreFn,
        [
            // Ensure .gitignore changes are always reported
            rootGitIgnorePath
        ],
        outputChannel,
        "working-tree",
    );

    workingTreeWatcher.event(uri => {
        if (uri.fsPath === rootGitIgnorePath) {
            // Refresh gitignore handler
            outputChannel.appendLine(`TRACE: ${rootGitIgnorePath} changed, reloading ignore rules`);
            rootGitIgnoreFn = loadGitIgnore(rootGitIgnorePath, outputChannel);
            workingTreeWatcher.refresh();
        }
    });

    return workingTreeWatcher;
}

function loadGitIgnore(ignorePath: string, outputChannel: OutputChannel): ignore.Ignore {
    const ig = ignore();
    if (!fs.existsSync(ignorePath)) {
        outputChannel.appendLine(`TRACE: No .gitignore found at ${ignorePath}`);
        return ig;
    }
    try {
        const content = fs.readFileSync(ignorePath, "utf8");
        outputChannel.appendLine(`TRACE: Using .gitignore at ${ignorePath}`);
        outputChannel.appendLine(content);
        ig.add(content);
    } catch {
        outputChannel.appendLine(`TRACE: Unable to load .gitignore at ${ignorePath}`);
    }
    return ig;
}
