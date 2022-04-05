import path from "node:path";
import { commands, EventEmitter, Uri, workspace } from "vscode";
import { Branch, Ref, Remote, Status, StatusOptions } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { Commit } from "../../git/Commit.js";
import type { Submodule } from "../../git/Submodule.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import type { Box } from "../../util.js";
import { createResource as createBaseResource, Resource } from "../Resource.js";
import { ResourceGroupType, ResourceGroupTypeOptions } from "../ResourceGroupType.js";
import { getInputTemplate } from "./get-input-template.js";
import { getRebaseCommit } from "./get-rebase-commit.js";
import type { RunFn } from "./run.js";
import { handleLimitHit } from "./update-model-state/handle-limit-hit.js";
import { pigeonholeFileStatus } from "./update-model-state/pigeonhole-file-status.js";

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

    // TODO Account for potential missing items when limit is hit
    // Could use placeholder like "(empty)"
    const { status, didHitLimit } = await repository.getStatusTrackedAndMerge({ ignoreSubmodules });
    const pendingUntrackedStatus = repository.getStatusUntracked();

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
    const tracked: Resource[] = [];
    const merge: Resource[] = [];
    const untracked: Resource[] = [];

    function createResource(
        resourceGroupType: ResourceGroupTypeOptions,
        resourceUri: Uri,
        type: StatusOptions,
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
        "git.changedResources",
        [...merge, ...index, ...tracked, ...untracked].map(r => r.state.resourceUri.fsPath.toString()),
    );

    onDidChangeStatusEmitter.fire();

    sourceControlUI.sourceControl.commitTemplate = await getInputTemplate(repository);
}
