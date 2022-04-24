import path from "node:path";
import { Command, Uri } from "vscode";
import { Status } from "../api/git.js";
import type { Submodule } from "../git/Submodule.js";
import * as i18n from "../i18n/mod.js";
import type { SourceControlResourceGroupUI } from "../ui/source-control.js";
import { toGitUri } from "../uri.js";
import * as config from "../util/config.js";
import type { Resource, ResourceState } from "./Resource.js";
import { ResourceGroupType } from "./ResourceGroupType.js";

function getTitleFromResource(resource: Resource): string {
    const basename = path.basename(resource.state.resourceUri.fsPath);

    switch (resource.state.type) {
        case Status.INDEX_MODIFIED:
        case Status.INDEX_RENAMED:
        case Status.INDEX_ADDED:
            return i18n.Translations.gitTitleIndex(basename);

        case Status.MODIFIED:
        case Status.BOTH_ADDED:
        case Status.BOTH_MODIFIED:
            return i18n.Translations.gitTitleWorkingTree(basename);

        case Status.INDEX_DELETED:
        case Status.DELETED:
            return i18n.Translations.gitTitleDeleted(basename);

        case Status.DELETED_BY_US:
            return i18n.Translations.gitTitleTheirs(basename);

        case Status.DELETED_BY_THEM:
            return i18n.Translations.gitTitleOurs(basename);

        case Status.UNTRACKED:
            return i18n.Translations.gitTitleUntracked(basename);

        default:
            return "";
    }
}

function getLeftResource(resourceState: ResourceState): Uri | undefined {
    switch (resourceState.type) {
        case Status.INDEX_MODIFIED:
        case Status.INDEX_RENAMED:
        case Status.INDEX_ADDED:
            return toGitUri(resourceState.original, "HEAD");

        case Status.MODIFIED:
        case Status.UNTRACKED:
            return toGitUri(resourceState.resourceUri, "~");

        case Status.DELETED_BY_US:
        case Status.DELETED_BY_THEM:
            return toGitUri(resourceState.resourceUri, "~1");
    }
    return undefined;
}

function getRightResource(resourceState: ResourceState, indexGroup: SourceControlResourceGroupUI): Uri | undefined {
    switch (resourceState.type) {
        case Status.INDEX_MODIFIED:
        case Status.INDEX_ADDED:
        case Status.INDEX_COPIED:
        case Status.INDEX_RENAMED:
            return toGitUri(resourceState.resourceUri, "");

        case Status.INDEX_DELETED:
        case Status.DELETED:
            return toGitUri(resourceState.resourceUri, "HEAD");

        case Status.DELETED_BY_US:
            return toGitUri(resourceState.resourceUri, "~3");

        case Status.DELETED_BY_THEM:
            return toGitUri(resourceState.resourceUri, "~2");

        case Status.MODIFIED:
        case Status.UNTRACKED:
        case Status.IGNORED:
        case Status.INTENT_TO_ADD:
            const uriString = resourceState.resourceUri.toString();
            const [indexStatus] = indexGroup.resourceStates.get().filter(r =>
                r.state.resourceUri.toString() === uriString
            );

            if (indexStatus && indexStatus.state.renameResourceUri) {
                return indexStatus.state.renameResourceUri;
            }

            return resourceState.resourceUri;

        case Status.BOTH_ADDED:
        case Status.BOTH_MODIFIED:
            return resourceState.resourceUri;
    }

    return undefined;
}

export function resolveChangeCommand(resource: Resource): Command {
    const title = getTitleFromResource(resource);

    if (!resource.state.leftUri) {
        return {
            arguments: [
                resource.state.rightUri,
                { override: resource.state.type === Status.BOTH_MODIFIED ? false : undefined },
                title,
            ],
            command: "vscode.open",
            title: i18n.Translations.open(),
        };
    } else {
        return {
            arguments: [resource.state.leftUri, resource.state.rightUri, title],
            command: "vscode.diff",
            title: i18n.Translations.open(),
        };
    }
}

export function resolveFileCommand(resource: Resource): Command {
    return {
        arguments: [resource.state.resourceUri],
        command: "vscode.open",
        title: i18n.Translations.open(),
    };
}

export function resolveDefaultCommand(resource: Resource, repoRoot: string): Command {
    const openDiffOnClick = config.openDiffOnClick(Uri.file(repoRoot));
    return openDiffOnClick ? resolveChangeCommand(resource) : resolveFileCommand(resource);
}

/** @todo Strange responsibility set here. */
export function getResources(
    resourceState: ResourceState,
    repoRoot: string,
    submodules: Submodule[],
    indexGroup: SourceControlResourceGroupUI,
): [Uri | undefined, Uri | undefined] {
    for (const submodule of submodules) {
        if (path.join(repoRoot, submodule.path) === resourceState.resourceUri.fsPath) {
            return [
                undefined,
                toGitUri(
                    resourceState.resourceUri,
                    resourceState.resourceGroupType === ResourceGroupType.Index ? "index" : "wt",
                    { submoduleOf: repoRoot },
                ),
            ];
        }
    }

    return [getLeftResource(resourceState), getRightResource(resourceState, indexGroup)];
}
