import path from "node:path";
import { Uri } from "vscode";
import { Status, StatusOptions } from "../../../api/git.js";
import type { IFileStatus } from "../../../git/IFileStatus.js";
import type { Resource } from "../../Resource.js";
import { ResourceGroupType, ResourceGroupTypeOptions } from "../../ResourceGroupType.js";

// TODO Make pure
export function pigeonholeFileStatus(
    repoRoot: string,
    fileStatus: IFileStatus,
    createResource: (
        resourceGroupType: ResourceGroupTypeOptions,
        resourceUri: Uri,
        type: StatusOptions,
        renameResourceUri?: Uri,
    ) => Resource,
    index: Resource[],
    tracked: Resource[],
    merge: Resource[],
) {
    const uri = Uri.file(path.join(repoRoot, fileStatus.path));
    const renameUri = fileStatus.rename
        ? Uri.file(path.join(repoRoot, fileStatus.rename))
        : undefined;

    function createResourceWithUri(
        resourceGroupType: ResourceGroupTypeOptions,
        type: StatusOptions,
        renameResourceUri?: Uri,
    ) {
        return createResource(
            resourceGroupType,
            uri,
            type,
            renameResourceUri,
        );
    }

    switch (fileStatus.x + fileStatus.y) {
        case "!!":
            return tracked.push(
                createResourceWithUri(
                    ResourceGroupType.Untracked,
                    Status.IGNORED,
                ),
            );
        case "DD":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.BOTH_DELETED,
                ),
            );
        case "AU":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.ADDED_BY_US,
                ),
            );
        case "UD":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.DELETED_BY_THEM,
                ),
            );
        case "UA":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.ADDED_BY_THEM,
                ),
            );
        case "DU":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.DELETED_BY_US,
                ),
            );
        case "AA":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.BOTH_ADDED,
                ),
            );
        case "UU":
            return merge.push(
                createResourceWithUri(
                    ResourceGroupType.Merge,
                    Status.BOTH_MODIFIED,
                ),
            );
    }

    switch (fileStatus.x) {
        case "M":
            index.push(
                createResourceWithUri(
                    ResourceGroupType.Index,
                    Status.INDEX_MODIFIED,
                ),
            );
            break;
        case "A":
            index.push(
                createResourceWithUri(
                    ResourceGroupType.Index,
                    Status.INDEX_ADDED,
                ),
            );
            break;
        case "D":
            index.push(
                createResourceWithUri(
                    ResourceGroupType.Index,
                    Status.INDEX_DELETED,
                ),
            );
            break;
        case "R":
            index.push(
                createResourceWithUri(
                    ResourceGroupType.Index,
                    Status.INDEX_RENAMED,
                    renameUri,
                ),
            );
            break;
        case "C":
            index.push(
                createResourceWithUri(
                    ResourceGroupType.Index,
                    Status.INDEX_COPIED,
                    renameUri,
                ),
            );
            break;
    }

    switch (fileStatus.y) {
        case "M":
            tracked.push(
                createResourceWithUri(
                    ResourceGroupType.WorkingTree,
                    Status.MODIFIED,
                    renameUri,
                ),
            );
            break;
        case "D":
            tracked.push(
                createResourceWithUri(
                    ResourceGroupType.WorkingTree,
                    Status.DELETED,
                    renameUri,
                ),
            );
            break;
        case "A":
            tracked.push(
                createResourceWithUri(
                    ResourceGroupType.WorkingTree,
                    Status.INTENT_TO_ADD,
                    renameUri,
                ),
            );
            break;
    }

    return undefined;
}
