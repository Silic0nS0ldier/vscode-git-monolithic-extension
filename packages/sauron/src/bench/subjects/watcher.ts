import ignore from "ignore";
import fs from "node:fs";
import path from "node:path";
import BaseWatcher from "watcher";
import type { StartSubject } from "./mod.js";

/**
 * Mirrors `extension/src/watch/{watch,working-tree-watcher}.ts`: the same `watcher` options and ignore
 * function. Lock-file gating is left out, as sauron leaves it to the extension.
 */
export const start: StartSubject = options => {
    const { root, dotGit } = options;
    const rootGitIgnorePath = path.join(root, ".gitignore");
    const rootGitIgnore = ignore();
    if (fs.existsSync(rootGitIgnorePath)) {
        rootGitIgnore.add(fs.readFileSync(rootGitIgnorePath, "utf8"));
    }

    function ignoreFn(targetPath: string): boolean {
        if (targetPath === dotGit || targetPath.startsWith(dotGit + "/")) {
            return true;
        }
        const relativePath = path.relative(root, targetPath);
        if (relativePath === "" || relativePath.startsWith("..")) {
            return false;
        }
        try {
            return rootGitIgnore.ignores(relativePath);
        } catch {
            return false;
        }
    }

    let reported = new Set<string>();
    const watcher = new BaseWatcher(
        [root],
        {
            debounce: options.settleMs,
            ignoreInitial: true,
            renameDetection: false,
            recursive: true,
            ignore: ignoreFn,
        },
        (_event, targetPath) => {
            reported.add(targetPath);
            options.onNotify();
        },
    );
    watcher.on("ready", options.onNotify);

    return {
        async drain() {},
        takeReported() {
            const taken = reported;
            reported = new Set();
            return taken;
        },
        async close() {
            watcher.close();
        },
    };
};
