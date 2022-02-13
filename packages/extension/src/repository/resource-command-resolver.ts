import path from "node:path";
import { Command, Uri, workspace } from "vscode";
import { Status } from "../api/git.js";
import { Repository } from "../repository.js";
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

function getRightResource(resource: Resource, repository: Repository): Uri | undefined {
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
            const [indexStatus] = repository.indexGroup.resourceStates.filter(r =>
                r.resourceUri.toString() === uriString
            );

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
            command: "vscode.open",
            title: localize("open", "Open"),
            arguments: [
                resource.rightUri,
                { override: resource.type === Status.BOTH_MODIFIED ? false : undefined },
                title,
            ],
        };
    } else {
        return {
            command: "vscode.diff",
            title: localize("open", "Open"),
            arguments: [resource.leftUri, resource.rightUri, title],
        };
    }
}

export function resolveFileCommand(resource: Resource): Command {
    return {
        command: "vscode.open",
        title: localize("open", "Open"),
        arguments: [resource.resourceUri],
    };
}

export function resolveDefaultCommand(resource: Resource, repository: Repository): Command {
    const config = workspace.getConfiguration("git", Uri.file(repository.root));
    const openDiffOnClick = config.get<boolean>("openDiffOnClick", true);
    return openDiffOnClick ? resolveChangeCommand(resource) : resolveFileCommand(resource);
}

export function getResources(resource: Resource, repository: Repository): [Uri | undefined, Uri | undefined] {
    for (const submodule of repository.submodules) {
        if (path.join(repository.root, submodule.path) === resource.resourceUri.fsPath) {
            return [
                undefined,
                toGitUri(
                    resource.resourceUri,
                    resource.resourceGroupType === ResourceGroupType.Index ? "index" : "wt",
                    { submoduleOf: repository.root },
                ),
            ];
        }
    }

    return [getLeftResource(resource), getRightResource(resource, repository)];
}
