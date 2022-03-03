import path from "node:path";
import { commands, EventEmitter, SourceControl, Uri, window, workspace } from "vscode";
import { Branch, Ref, Remote, Status } from "../../api/git.js";
import { Repository } from "../../git.js";
import { Submodule } from "../../git/Submodule.js";
import { Commit } from "../../git/Commit.js";
import { Box, localize } from "../../util.js";
import { GitResourceGroup } from "../GitResourceGroup.js";
import { Resource } from "../Resource.js";
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
    indexGroup: GitResourceGroup,
    mergeGroup: GitResourceGroup,
    workingTreeGroup: GitResourceGroup,
    untrackedGroup: GitResourceGroup,
    setCountBadge: () => void,
    onDidChangeStatusEmitter: EventEmitter<void>,
    sourceControl: SourceControl,
) {
    const scopedConfig = workspace.getConfiguration("git", Uri.file(repository.root));
    const ignoreSubmodules = scopedConfig.get<boolean>("ignoreSubmodules");

    const { status, didHitLimit } = await repository.getStatus({ ignoreSubmodules });

    const config = workspace.getConfiguration("git");
    const shouldIgnore = config.get<boolean>("ignoreLimitWarning") === true;
    const useIcons = !config.get<boolean>("decorations.enabled", true);
    isRepositoryHuge.set(didHitLimit);

    if (didHitLimit && !shouldIgnore && !didWarnAboutLimit.get()) {
        const knownHugeFolderPaths = await findKnownHugeFolderPathsToIgnore(repoRoot, run, repository);
        const gitWarn = localize(
            "huge",
            "The git repository at '{0}' has too many active changes, only a subset of Git features will be enabled.",
            repository.root,
        );
        const neverAgain = { title: localize("neveragain", "Don't Show Again") };

        if (knownHugeFolderPaths.length > 0) {
            const folderPath = knownHugeFolderPaths[0];
            const folderName = path.basename(folderPath);

            const addKnown = localize("add known", "Would you like to add '{0}' to .gitignore?", folderName);
            const yes = { title: localize("yes", "Yes") };

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

    const untrackedChanges = scopedConfig.get<"mixed" | "separate" | "hidden">("untrackedChanges");
    const index: Resource[] = [];
    const workingTree: Resource[] = [];
    const merge: Resource[] = [];
    const untracked: Resource[] = [];

    status.forEach(raw => {
        const uri = Uri.file(path.join(repository.root, raw.path));
        const renameUri = raw.rename
            ? Uri.file(path.join(repository.root, raw.rename))
            : undefined;

        switch (raw.x + raw.y) {
            case "??":
                switch (untrackedChanges) {
                    case "mixed":
                        return workingTree.push(
                            new Resource(
                                repoRoot,
                                submodules.get(),
                                indexGroup,
                                ResourceGroupType.WorkingTree,
                                uri,
                                Status.UNTRACKED,
                                useIcons,
                            ),
                        );
                    case "separate":
                        return untracked.push(
                            new Resource(
                                repoRoot,
                                submodules.get(),
                                indexGroup,
                                ResourceGroupType.Untracked,
                                uri,
                                Status.UNTRACKED,
                                useIcons,
                            ),
                        );
                    default:
                        return undefined;
                }
            case "!!":
                switch (untrackedChanges) {
                    case "mixed":
                        return workingTree.push(
                            new Resource(
                                repoRoot,
                                submodules.get(),
                                indexGroup,
                                ResourceGroupType.WorkingTree,
                                uri,
                                Status.IGNORED,
                                useIcons,
                            ),
                        );
                    case "separate":
                        return untracked.push(
                            new Resource(
                                repoRoot,
                                submodules.get(),
                                indexGroup,
                                ResourceGroupType.Untracked,
                                uri,
                                Status.IGNORED,
                                useIcons,
                            ),
                        );
                    default:
                        return undefined;
                }
            case "DD":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.BOTH_DELETED,
                        useIcons,
                    ),
                );
            case "AU":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.ADDED_BY_US,
                        useIcons,
                    ),
                );
            case "UD":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.DELETED_BY_THEM,
                        useIcons,
                    ),
                );
            case "UA":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.ADDED_BY_THEM,
                        useIcons,
                    ),
                );
            case "DU":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.DELETED_BY_US,
                        useIcons,
                    ),
                );
            case "AA":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.BOTH_ADDED,
                        useIcons,
                    ),
                );
            case "UU":
                return merge.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Merge,
                        uri,
                        Status.BOTH_MODIFIED,
                        useIcons,
                    ),
                );
        }

        switch (raw.x) {
            case "M":
                index.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Index,
                        uri,
                        Status.INDEX_MODIFIED,
                        useIcons,
                    ),
                );
                break;
            case "A":
                index.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Index,
                        uri,
                        Status.INDEX_ADDED,
                        useIcons,
                    ),
                );
                break;
            case "D":
                index.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Index,
                        uri,
                        Status.INDEX_DELETED,
                        useIcons,
                    ),
                );
                break;
            case "R":
                index.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Index,
                        uri,
                        Status.INDEX_RENAMED,
                        useIcons,
                        renameUri,
                    ),
                );
                break;
            case "C":
                index.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.Index,
                        uri,
                        Status.INDEX_COPIED,
                        useIcons,
                        renameUri,
                    ),
                );
                break;
        }

        switch (raw.y) {
            case "M":
                workingTree.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.WorkingTree,
                        uri,
                        Status.MODIFIED,
                        useIcons,
                        renameUri,
                    ),
                );
                break;
            case "D":
                workingTree.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.WorkingTree,
                        uri,
                        Status.DELETED,
                        useIcons,
                        renameUri,
                    ),
                );
                break;
            case "A":
                workingTree.push(
                    new Resource(
                        repoRoot,
                        submodules.get(),
                        indexGroup,
                        ResourceGroupType.WorkingTree,
                        uri,
                        Status.INTENT_TO_ADD,
                        useIcons,
                        renameUri,
                    ),
                );
                break;
        }

        return undefined;
    });

    // set resource groups
    mergeGroup.resourceStates = merge;
    indexGroup.resourceStates = index;
    workingTreeGroup.resourceStates = workingTree;
    untrackedGroup.resourceStates = untracked;

    // set count badge
    setCountBadge();

    // Update context key with changed resources
    commands.executeCommand(
        "setContext",
        "git.changedResources",
        [...merge, ...index, ...workingTree, ...untracked].map(r => r.resourceUri.fsPath.toString()),
    );

    onDidChangeStatusEmitter.fire();

    sourceControl.commitTemplate = await getInputTemplate(repository);
}
