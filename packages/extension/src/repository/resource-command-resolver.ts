import path from "node:path";
import { Command, Uri, workspace } from "vscode";
import { Status } from "../api/git.js";
import { Submodule } from "../git/Submodule.js";
import { SourceControlResourceGroupUI } from "../ui/source-control.js";
import { toGitUri } from "../uri.js";
import { localize } from "../util.js";
import { Resource } from "./Resource.js";
import { ResourceGroupType } from "./ResourceGroupType.js";

function getTitleFromResource(resource: Resource): string {
    const basename = path.basename(resource.resourceUri.fsPath);

    switch (resource.type) {
        case Status.INDEX_MODIFIED:
        case Status.INDEX_RENAMED:
        case Status.INDEX_ADDED:
            return localize("git.title.index", "{0} (Index)", basename);

        case Status.MODIFIED:
        case Status.BOTH_ADDED:
        case Status.BOTH_MODIFIED:
            return localize("git.title.workingTree", "{0} (Working Tree)", basename);

        case Status.INDEX_DELETED:
        case Status.DELETED:
            return localize("git.title.deleted", "{0} (Deleted)", basename);

        case Status.DELETED_BY_US:
            return localize("git.title.theirs", "{0} (Theirs)", basename);

        case Status.DELETED_BY_THEM:
            return localize("git.title.ours", "{0} (Ours)", basename);

        case Status.UNTRACKED:
            return localize("git.title.untracked", "{0} (Untracked)", basename);

        default:
            return "";
    }
}

function getLeftResource(resource: Resource): Uri | undefined {
    switch (resource.type) {
        case Status.INDEX_MODIFIED:
        case Status.INDEX_RENAMED:
        case Status.INDEX_ADDED:
            return toGitUri(resource.original, "HEAD");

        case Status.MODIFIED:
        case Status.UNTRACKED:
            return toGitUri(resource.resourceUri, "~");

        case Status.DELETED_BY_US:
        case Status.DELETED_BY_THEM:
            return toGitUri(resource.resourceUri, "~1");
    }
    return undefined;
}

function getRightResource(resource: Resource, indexGroup: SourceControlResourceGroupUI): Uri | undefined {
    switch (resource.type) {
        case Status.INDEX_MODIFIED:
        case Status.INDEX_ADDED:
        case Status.INDEX_COPIED:
        case Status.INDEX_RENAMED:
            return toGitUri(resource.resourceUri, "");

        case Status.INDEX_DELETED:
        case Status.DELETED:
            return toGitUri(resource.resourceUri, "HEAD");

        case Status.DELETED_BY_US:
            return toGitUri(resource.resourceUri, "~3");

        case Status.DELETED_BY_THEM:
            return toGitUri(resource.resourceUri, "~2");

        case Status.MODIFIED:
        case Status.UNTRACKED:
        case Status.IGNORED:
        case Status.INTENT_TO_ADD:
            const uriString = resource.resourceUri.toString();
            const [indexStatus] = indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString);

            if (indexStatus && indexStatus.renameResourceUri) {
                return indexStatus.renameResourceUri;
            }

            return resource.resourceUri;

        case Status.BOTH_ADDED:
        case Status.BOTH_MODIFIED:
            return resource.resourceUri;
    }

    return undefined;
}

export function resolveChangeCommand(resource: Resource): Command {
    const title = getTitleFromResource(resource);

    if (!resource.leftUri) {
        return {
            arguments: [
                resource.rightUri,
                { override: resource.type === Status.BOTH_MODIFIED ? false : undefined },
                title,
            ],
            command: "vscode.open",
            title: localize("open", "Open"),
        };
    } else {
        return {
            arguments: [resource.leftUri, resource.rightUri, title],
            command: "vscode.diff",
            title: localize("open", "Open"),
        };
    }
}

export function resolveFileCommand(resource: Resource): Command {
    return {
        arguments: [resource.resourceUri],
        command: "vscode.open",
        title: localize("open", "Open"),
    };
}

export function resolveDefaultCommand(resource: Resource, repoRoot: string): Command {
    const config = workspace.getConfiguration("git", Uri.file(repoRoot));
    const openDiffOnClick = config.get<boolean>("openDiffOnClick", true);
    return openDiffOnClick ? resolveChangeCommand(resource) : resolveFileCommand(resource);
}

/** @todo Strange responsibility set here. */
export function getResources(
    resource: Resource,
    repoRoot: string,
    submodules: Submodule[],
    indexGroup: SourceControlResourceGroupUI,
): [Uri | undefined, Uri | undefined] {
    for (const submodule of submodules) {
        if (path.join(repoRoot, submodule.path) === resource.resourceUri.fsPath) {
            return [
                undefined,
                toGitUri(
                    resource.resourceUri,
                    resource.resourceGroupType === ResourceGroupType.Index ? "index" : "wt",
                    { submoduleOf: repoRoot },
                ),
            ];
        }
    }

    return [getLeftResource(resource), getRightResource(resource, indexGroup)];
}
