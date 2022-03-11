import fs from "node:fs";
import path from "node:path";
import type { Repository } from "../../git.js";
import { checkIgnore } from "./check-ignore.js";
import type { RunFn } from "./run.js";

const KnownHugeFolderNames = ["node_modules"];

/**
 * @deprecated There are smarter ways to work with a git repository then hardcoding large folders.
 */
export async function findKnownHugeFolderPathsToIgnore(
    repoRoot: string,
    run: RunFn<Set<string>>,
    repository: Repository,
): Promise<string[]> {
    const folderPaths: string[] = [];

    for (const folderName of KnownHugeFolderNames) {
        const folderPath = path.join(repoRoot, folderName);

        if (await new Promise<boolean>(c => fs.exists(folderPath, c))) {
            folderPaths.push(folderPath);
        }
    }

    const ignored = await checkIgnore(run, repoRoot, repository, folderPaths);

    return folderPaths.filter(p => !ignored.has(p));
}
