import path from "node:path";
import { commands, EventEmitter, Uri } from "vscode";
import { type Branch, type Ref, type Remote, Status, type StatusOptions } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { Commit } from "../../git/Commit.js";
import type { Submodule } from "../../git/Submodule.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import type { Box } from "../../util/box.js";
import * as config from "../../util/config.js";
import { createResource as createBaseResource, Resource } from "../Resource.js";
import { ResourceGroupType, type ResourceGroupTypeOptions } from "../ResourceGroupType.js";
import { getInputTemplate } from "./get-input-template.js";
import { getRebaseCommit } from "./get-rebase-commit.js";
import { pigeonholeFileStatus } from "./update-model-state/pigeonhole-file-status.js";

function arraysEqualBy<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): boolean {
    if (a === b) {
        return true;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (!eq(a[i], b[i])) {
            return false;
        }
    }
    return true;
}

function branchEqual(a: Branch | undefined, b: Branch | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return a.type === b.type
        && a.name === b.name
        && a.commit === b.commit
        && a.remote === b.remote
        && a.ahead === b.ahead
        && a.behind === b.behind
        && (a.upstream === b.upstream
            || (!!a.upstream && !!b.upstream
                && a.upstream.name === b.upstream.name
                && a.upstream.remote === b.upstream.remote));
}

function refEqual(a: Ref, b: Ref): boolean {
    return a.type === b.type && a.name === b.name && a.commit === b.commit && a.remote === b.remote;
}

function remoteEqual(a: Remote, b: Remote): boolean {
    return a.name === b.name
        && a.fetchUrl === b.fetchUrl
        && a.pushUrl === b.pushUrl
        && a.isReadOnly === b.isReadOnly;
}

function submoduleEqual(a: Submodule, b: Submodule): boolean {
    return a.name === b.name && a.path === b.path && a.url === b.url;
}

function rebaseCommitEqual(a: Commit | undefined, b: Commit | undefined): boolean {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    // The hash identifies the commit; other fields are derived from it.
    return a.hash === b.hash;
}

function resourceEqual(a: Resource, b: Resource): boolean {
    return a.state.type === b.state.type
        && a.state.resourceUri.fsPath === b.state.resourceUri.fsPath
        && a.state.renameResourceUri?.fsPath === b.state.renameResourceUri?.fsPath;
}

export async function updateModelState(
    repository: Repository,
    HEAD: Box<Branch | undefined>,
    refs: Box<Ref[]>,
    remotes: Box<Remote[]>,
    submodules: Box<Submodule[]>,
    rebaseCommit: Box<Commit | undefined>,
    repoRoot: string,
    setCountBadge: () => void,
    onDidChangeStatusEmitter: EventEmitter<void>,
    sourceControlUI: SourceControlUIGroup,
): Promise<void> {
    const ignoreSubmodules = config.ignoreSubmodules(Uri.file(repository.root));

    // Snapshot previous state so we can detect whether this refresh actually
    // produced any change worth notifying listeners about. Reading now (before
    // any `.set()` below) captures the pre-update values.
    const prevHEAD = HEAD.get();
    const prevRefs = refs.get();
    const prevRemotes = remotes.get();
    const prevSubmodules = submodules.get();
    const prevRebaseCommit = rebaseCommit.get();
    const prevMerge = sourceControlUI.mergeGroup.resourceStates.get();
    const prevIndex = sourceControlUI.stagedGroup.resourceStates.get();
    const prevTracked = sourceControlUI.trackedGroup.resourceStates.get();
    const prevUntracked = sourceControlUI.untrackedGroup.resourceStates.get();

    // TODO Account for potential missing items when limit is hit
    // Could use placeholder like "(empty)"
    // UI currently handles this using a heuristic
    const status = await repository.getStatusTrackedAndMerge({ ignoreSubmodules });
    const pendingUntrackedStatus = repository.getStatusUntracked();
    const useIcons = !config.decorationsEnabled();

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

    let sort = config.branchSortOrder();
    // TODO Handle in config sanitisation
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
    const tracked: Resource[] = [];
    const merge: Resource[] = [];
    const untracked: Resource[] = [];

    function createResource(
        resourceGroupType: ResourceGroupTypeOptions,
        resourceUri: Uri,
        type: StatusOptions,
        renameResourceUri?: Uri,
    ): Resource {
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
        pigeonholeFileStatus(repoRoot, fileStatus, createResource, index, tracked, merge);
    }

    // set resource groups
    sourceControlUI.mergeGroup.resourceStates.set(merge);
    sourceControlUI.stagedGroup.resourceStates.set(index);
    sourceControlUI.trackedGroup.resourceStates.set(tracked);

    // handle untracked
    const untrackedStatus = await pendingUntrackedStatus;
    for (const untrackedFile of untrackedStatus) {
        untracked.push(
            createResource(
                ResourceGroupType.Untracked,
                Uri.file(path.join(repoRoot, untrackedFile)),
                Status.UNTRACKED,
            ),
        );
    }

    sourceControlUI.untrackedGroup.resourceStates.set(untracked);

    // set count badge
    setCountBadge();

    // Update context key with changed resources
    commands.executeCommand(
        "setContext",
        "git_monolithic.context.changedResources",
        [...merge, ...index, ...tracked, ...untracked].map(r => r.state.resourceUri.fsPath.toString()),
    );

    const hasMeaningfulChange = !branchEqual(prevHEAD, newHEAD)
        || !arraysEqualBy(prevRefs, newRefs, refEqual)
        || !arraysEqualBy(prevRemotes, newRemotes, remoteEqual)
        || !arraysEqualBy(prevSubmodules, newSubmodules, submoduleEqual)
        || !rebaseCommitEqual(prevRebaseCommit, newRebaseCommit)
        || !arraysEqualBy(prevMerge, merge, resourceEqual)
        || !arraysEqualBy(prevIndex, index, resourceEqual)
        || !arraysEqualBy(prevTracked, tracked, resourceEqual)
        || !arraysEqualBy(prevUntracked, untracked, resourceEqual);

    if (hasMeaningfulChange) {
        onDidChangeStatusEmitter.fire();
    }

    sourceControlUI.sourceControl.commitTemplate = await getInputTemplate(repository);
}
