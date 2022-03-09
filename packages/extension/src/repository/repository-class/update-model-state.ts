import path from "node:path";
import { commands, EventEmitter, Uri, window, workspace, WorkspaceConfiguration } from "vscode";
import { Branch, Ref, Remote, Status } from "../../api/git.js";
import { Repository } from "../../git.js";
import { Commit } from "../../git/Commit.js";
import { IFileStatus } from "../../git/IFileStatus.js";
import { Submodule } from "../../git/Submodule.js";
import { SourceControlUIGroup } from "../../ui/source-control.js";
import { Box, localize } from "../../util.js";
import { createResource as createBaseResource, Resource } from "../Resource.js";
import { ResourceGroupType } from "../ResourceGroupType.js";
import { findKnownHugeFolderPathsToIgnore } from "./find-known-huge-folder-paths-to-ignore.js";
import { getInputTemplate } from "./get-input-template.js";
import { getRebaseCommit } from "./get-rebase-commit.js";
import { ignore } from "./ignore.js";
import { RunFn } from "./run.js";

export async function updateModelState(
    repository: Repository,
    isRepositoryHuge: Box<boolean>,
    didWarnAboutLimit: Box<boolean>,
    run: RunFn<void> & RunFn<Set<string>>,
    HEAD: Box<Branch | undefined>,
    refs: Box<Ref[]>,
    remotes: Box<Remote[]>,
    submodules: Box<Submodule[]>,
    rebaseCommit: Box<Commit | undefined>,
    repoRoot: string,
    setCountBadge: () => void,
    onDidChangeStatusEmitter: EventEmitter<void>,
    sourceControlUI: SourceControlUIGroup,
) {
    const scopedConfig = workspace.getConfiguration("git", Uri.file(repository.root));
    const ignoreSubmodules = scopedConfig.get<boolean>("ignoreSubmodules");

    // TODO Account for potential missing items
    const { status, didHitLimit } = await repository.getStatus({ ignoreSubmodules });

    const config = workspace.getConfiguration("git");
    const shouldIgnore = config.get<boolean>("ignoreLimitWarning") === true;
    const useIcons = !config.get<boolean>("decorations.enabled", true);
    isRepositoryHuge.set(didHitLimit);

    if (didHitLimit && !shouldIgnore && !didWarnAboutLimit.get()) {
        // Deliberately not awaited to keep model update going
        handleLimitHit(repoRoot, run, repository, config, didWarnAboutLimit);
    }

    let newHEAD: Branch | undefined;

    try {
        newHEAD = await repository.getHEAD();

        if (newHEAD.name) {
            try {
                newHEAD = await repository.getBranch(newHEAD.name);
            } catch (err) {
                // noop
            }
        }
    } catch (err) {
        // noop
    }

    let sort = config.get<"alphabetically" | "committerdate">("branchSortOrder") || "alphabetically";
    if (sort !== "alphabetically" && sort !== "committerdate") {
        sort = "alphabetically";
    }
    const [newRefs, newRemotes, newSubmodules, newRebaseCommit] = await Promise.all([
        repository.getRefs({ sort }),
        repository.getRemotes(),
        repository.getSubmodules(),
        getRebaseCommit(repository),
    ]);

    HEAD.set(newHEAD);
    refs.set(newRefs);
    remotes.set(newRemotes);
    submodules.set(newSubmodules);
    rebaseCommit.set(newRebaseCommit);

    const index: Resource[] = [];
    const workingTree: Resource[] = [];
    const merge: Resource[] = [];
    const untracked: Resource[] = [];

    function createResource(
        resourceGroupType: ResourceGroupType,
        resourceUri: Uri,
        type: Status,
        renameResourceUri?: Uri,
    ) {
        return createBaseResource(
            repoRoot,
            submodules.get(),
            sourceControlUI,
            resourceGroupType,
            resourceUri,
            type,
            useIcons,
            renameResourceUri,
        );
    }

    for (const fileStatus of status) {
        pigeonholeFileStatus(repoRoot, fileStatus, createResource, index, workingTree, merge, untracked);
    }

    // set resource groups
    sourceControlUI.mergeGroup.resourceStates.set(merge);
    sourceControlUI.stagedGroup.resourceStates.set(index);
    sourceControlUI.trackedGroup.resourceStates.set(workingTree);
    sourceControlUI.untrackedGroup.resourceStates.set(untracked);

    // set count badge
    setCountBadge();

    // Update context key with changed resources
    commands.executeCommand(
        "setContext",
        "git.changedResources",
        [...merge, ...index, ...workingTree, ...untracked].map(r => r.state.resourceUri.fsPath.toString()),
    );

    onDidChangeStatusEmitter.fire();

    sourceControlUI.sourceControl.commitTemplate = await getInputTemplate(repository);
}

function pigeonholeFileStatus(
    repoRoot: string,
    fileStatus: IFileStatus,
    createResource: (
        resourceGroupType: ResourceGroupType,
        resourceUri: Uri,
        type: Status,
        renameResourceUri?: Uri,
    ) => Resource,
    index: Resource[],
    workingTree: Resource[],
    merge: Resource[],
    untracked: Resource[],
) {
    const uri = Uri.file(path.join(repoRoot, fileStatus.path));
    const renameUri = fileStatus.rename
        ? Uri.file(path.join(repoRoot, fileStatus.rename))
        : undefined;

    function createResourceWithUri(
        resourceGroupType: ResourceGroupType,
        type: Status,
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
        case "??":
            return untracked.push(
                createResourceWithUri(
                    ResourceGroupType.Untracked,
                    Status.UNTRACKED,
                ),
            );
        case "!!":
            return untracked.push(
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
            workingTree.push(
                createResourceWithUri(
                    ResourceGroupType.WorkingTree,
                    Status.MODIFIED,
                    renameUri,
                ),
            );
            break;
        case "D":
            workingTree.push(
                createResourceWithUri(
                    ResourceGroupType.WorkingTree,
                    Status.DELETED,
                    renameUri,
                ),
            );
            break;
        case "A":
            workingTree.push(
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

async function handleLimitHit(
    repoRoot: string,
    run: RunFn<void> & RunFn<Set<string>>,
    repository: Repository,
    config: WorkspaceConfiguration,
    didWarnAboutLimit: Box<boolean>,
) {
    const knownHugeFolderPaths = await findKnownHugeFolderPathsToIgnore(repoRoot, run, repository);
    const gitWarn = localize(
        "huge",
        "The git repository at '{0}' has too many active changes, only a subset of Git features will be enabled.",
        repoRoot,
    );
    const neverAgain = { title: localize("neveragain", "Don't Show Again") };

    if (knownHugeFolderPaths.length > 0) {
        const folderPath = knownHugeFolderPaths[0];
        const folderName = path.basename(folderPath);

        const addKnown = localize("add known", "Would you like to add '{0}' to .gitignore?", folderName);
        const yes = { title: localize("yes", "Yes") };

        // this is why things slow down
        const result = await window.showWarningMessage(`${gitWarn} ${addKnown}`, yes, neverAgain);

        if (result === neverAgain) {
            config.update("ignoreLimitWarning", true, false);
            didWarnAboutLimit.set(true);
        } else if (result === yes) {
            ignore(run, repository, [Uri.file(folderPath)]);
        }
    } else {
        const result = await window.showWarningMessage(gitWarn, neverAgain);

        if (result === neverAgain) {
            config.update("ignoreLimitWarning", true, false);
        }

        didWarnAboutLimit.set(true);
    }
}
