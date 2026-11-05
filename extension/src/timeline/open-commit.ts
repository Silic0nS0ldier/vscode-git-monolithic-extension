import { changes } from "monolithic-git-interop/api/diff/changes";
import { emptyTree } from "monolithic-git-interop/api/hash-object/empty-tree";
import { unwrapOk } from "monolithic-git-interop/errors";
import path from "node:path";
import { commands, Uri } from "vscode";
import type { Git } from "../git.js";
import type { Model } from "../model.js";
import { toGitUri } from "../uri.js";
import { contextFor } from "./git-context.js";
import type { GitTimelineItem } from "./item.js";

export async function openCommit(model: Model, git: Git, item: GitTimelineItem): Promise<void> {
    const repository = model.getRepository(item.rootUri);
    if (!repository) throw new Error("Timeline repository is no longer open");
    const commit = await repository.getCommit(item.ref);
    const parent = commit.parents[0] ?? unwrapOk(await emptyTree(contextFor(git, "hash-object"), repository.root));
    const entries = unwrapOk(await changes(contextFor(git, "diff"), repository.root, parent, commit.hash));
    const resources = entries.map(change => {
        const uri = Uri.file(path.join(repository.root, change.path));
        const original = Uri.file(path.join(repository.root, change.originalPath ?? change.path));
        return [
            uri,
            change.status === "A" ? undefined : toGitUri(original, parent),
            change.status === "D" ? undefined : toGitUri(uri, commit.hash),
        ];
    });
    await commands.executeCommand(
        "vscode.changes",
        `${item.shortRef} - ${commit.message.split("\n", 1)[0]}`,
        resources,
    );
}
