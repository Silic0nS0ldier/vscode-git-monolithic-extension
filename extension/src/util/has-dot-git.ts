import * as fsp from "node:fs/promises";
import * as path from "node:path";

/**
 * Whether `folderPath` is the top of a work tree, judged without git. `.git` is a directory, or
 * in linked worktrees and submodules a file pointing at one.
 */
export async function hasDotGit(folderPath: string): Promise<boolean> {
    const dotGit = path.join(folderPath, ".git");

    try {
        const stat = await fsp.stat(dotGit);
        if (stat.isDirectory()) {
            return true;
        }
        return stat.isFile() && (await fsp.readFile(dotGit, "utf8")).startsWith("gitdir: ");
    } catch {
        return false;
    }
}
