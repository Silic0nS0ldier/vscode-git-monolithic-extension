import ignore from "ignore";
import fs from "node:fs";
import path from "node:path";
import { inspect } from "node:util";
import { Disposable, type Event, Uri } from "vscode";
import { error, trace } from "../tracing.js";
import { transientGitLocks } from "./lock-gate.js";
import { createIgnoreFnFromList, type SuspendHandle, watch } from "./watch.js";

export function createWorkingTreeWatcher(
    repoRoot: string,
    dotGit: string,
): { event: Event<Uri>; suspend: () => SuspendHandle } & Disposable {
    const rootGitIgnorePath = path.join(repoRoot, ".gitignore");
    let rootGitIgnoreFn: ignore.Ignore = loadGitIgnore(rootGitIgnorePath);

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
            error(`Path '${targetPath}' triggered an error in 'ignore' package: ` + inspect(e));
        }
        return false;
    };

    const workingTreeWatcher = watch(
        [
            repoRoot,
        ],
        transientGitLocks(dotGit),
        combinedIgnoreFn,
        [
            // Ensure .gitignore changes are always reported
            rootGitIgnorePath,
        ],
        "working-tree",
    );

    workingTreeWatcher.event(uri => {
        if (uri.fsPath === rootGitIgnorePath) {
            // Refresh gitignore handler
            trace(`${rootGitIgnorePath} changed, reloading ignore rules`);
            rootGitIgnoreFn = loadGitIgnore(rootGitIgnorePath);
            workingTreeWatcher.refresh();
        }
    });

    return workingTreeWatcher;
}

function loadGitIgnore(ignorePath: string): ignore.Ignore {
    const ig = ignore();
    if (!fs.existsSync(ignorePath)) {
        trace(`No .gitignore found at ${ignorePath}`);
        return ig;
    }
    try {
        const content = fs.readFileSync(ignorePath, "utf8");
        trace(`Using .gitignore at ${ignorePath}`);
        trace(content);
        ig.add(content);
    } catch {
        trace(`Unable to load .gitignore at ${ignorePath}`);
    }
    return ig;
}
