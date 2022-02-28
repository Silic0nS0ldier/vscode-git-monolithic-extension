import path from "node:path";
import fs from "node:fs";
import { Commit, Repository } from "../../git.js";

export async function getRebaseCommit(
    repository: Repository,
): Promise<Commit | undefined> {
    const rebaseHeadPath = path.join(repository.root, ".git", "REBASE_HEAD");
    const rebaseApplyPath = path.join(repository.root, ".git", "rebase-apply");
    const rebaseMergePath = path.join(repository.root, ".git", "rebase-merge");

    try {
        const rebaseApplyExists = fs.existsSync(rebaseApplyPath);
        const rebaseMergePathExists = fs.existsSync(rebaseMergePath);
        const rebaseHead = await fs.promises.readFile(rebaseHeadPath, "utf-8");
        if (!rebaseApplyExists && !rebaseMergePathExists) {
            return undefined;
        }
        return await repository.getCommit(rebaseHead.trim());
    } catch (err) {
        return undefined;
    }
}