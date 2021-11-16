import { OutputChannel, Uri } from "vscode";
import { CommitOptions } from "../api/git";
import { PushOptions, RunByRepository, ScmCommand } from "../commands";
import { Git, Stash } from "../git.js";
import { Model } from "../model";
import { Repository, Resource } from "../repository.js";

import * as addRemote from "./implementations/add-remote.js";
import * as branchFrom from "./implementations/branch-from.js";
import * as branch from "./implementations/branch.js";
import * as checkoutDetached from "./implementations/checkout-detached.js";
import * as checkout from "./implementations/checkout.js";
import * as cherryPick from "./implementations/cherry-pick.js";
import * as cleanAllTracked from "./implementations/clean-all-tracked.js";
import * as cleanAllUntracked from "./implementations/clean-all-untracked.js";
import * as cleanAll from "./implementations/clean-all.js";
import * as clean from "./implementations/clean.js";
import * as cloneRecursive from "./implementations/clone-recursive.js";
import * as clone from "./implementations/clone.js";
import * as close from "./implementations/close.js";
import * as commitAllAmendNoVerify from "./implementations/commit-all-amend-no-verify.js";
import * as commitAllAmend from "./implementations/commit-all-amend.js";
import * as commitAllNoVerify from "./implementations/commit-all-no-verify.js";
import * as commitAllSignedNoVerify from "./implementations/commit-all-signed-no-verify.js";
import * as commitAllSigned from "./implementations/commit-all-signed.js";
import * as commitAll from "./implementations/commit-all.js";
import * as commitEmptyNoVerify from "./implementations/commit-empty-no-verify.js";
import * as commitEmpty from "./implementations/commit-empty.js";
import * as commitStagedAmendNoVerify from "./implementations/commit-staged-amend-no-verify.js";
import * as commitStagedAmend from "./implementations/commit-staged-amend.js";
import * as commitStagedNoVerify from "./implementations/commit-staged-no-verify.js";
import * as commitStagedSignedNoVerify from "./implementations/commit-staged-signed-no-verify.js";
import * as commitStagedSigned from "./implementations/commit-staged-signed.js";
import * as commitStaged from "./implementations/commit-staged.js";
import * as commit from "./implementations/commit.js";
import * as createTag from "./implementations/create-tag.js";
import * as deleteBranch from "./implementations/delete-branch.js";
import * as deleteTag from "./implementations/delete-tag.js";
import * as fetchAll from "./implementations/fetch-all.js";
import * as fetchPrune from "./implementations/fetch-prune.js";
import * as fetch from "./implementations/fetch.js";
import * as ignore from "./implementations/ignore.js";
import * as init from "./implementations/init.js";
import * as merge from "./implementations/merge.js";
import * as openAllChanges from "./implementations/open-all-changes.js";
import * as openChange from "./implementations/open-change.js";
import * as openFile2 from "./implementations/open-file-2.js";
import * as openFile from "./implementations/open-file.js";
import * as openHeadFile from "./implementations/open-head-file.js";
import * as openRepository from "./implementations/open-repository.js";
import * as openResource from "./implementations/open-resource.js";
import * as publish from "./implementations/publish.js";
import * as pullFrom from "./implementations/pull-from";
import * as pullRebase from "./implementations/pull-rebase.js";
import * as pull from "./implementations/pull.js";
import * as pushForce from "./implementations/push/push-force.js";
import * as pushTags from "./implementations/push/push-tags.js";
import * as pushToForce from "./implementations/push/push-to-force.js";
import * as pushTo from "./implementations/push/push-to.js";
import * as pushWithTagsForce from "./implementations/push/push-with-tags-force.js";
import * as pushWithTags from "./implementations/push/push-with-tags.js";
import * as push from "./implementations/push/push.js";
import * as rebaseAbort from "./implementations/rebase-abort.js";
import * as rebase from "./implementations/rebase.js";
import * as refresh from "./implementations/refresh.js";
import * as removeRemote from "./implementations/remove-remote.js";
import * as renameBranch from "./implementations/rename-branch.js";
import * as rename from "./implementations/rename.js";
import * as restoreCommitTemplate from "./implementations/restore-commit-template.js";
import * as revealInExplorer from "./implementations/reveal-in-explorer.js";
// import * as revertChange from "./implementations/revert-change.js";
// import * as revertSelectedRanges from "./implementations/revert-selected-ranges.js";
import * as setLogLevel from "./implementations/set-log-level.js";
import * as stageAllMerge from "./implementations/stage/stage-all-merge.js";
import * as stageAllTracked from "./implementations/stage/stage-all-tracked.js";
import * as stageAllUntracked from "./implementations/stage/stage-all-untracked.js";
import * as stageAll from "./implementations/stage/stage-all.js";
// import * as stageChange from "./implementations/stage/stage-change.js";
// import * as stageSelectedRanges from "./implementations/stage/stage-selected-ranges.js";
import * as stage from "./implementations/stage/stage.js";
import * as stashApplyLatest from "./implementations/stash-apply-latest.js";
import * as stashApply from "./implementations/stash-apply.js";
import * as stashDrop from "./implementations/stash-drop.js";
import * as stashIncludeUntracked from "./implementations/stash-include-untracked.js";
import * as stashPopLatest from "./implementations/stash-pop-latest.js";
import * as stashPop from "./implementations/stash-pop.js";
import * as stash from "./implementations/stash.js";
import * as syncRebase from "./implementations/sync-rebase.js";
import * as sync from "./implementations/sync.js";
import * as undoCommit from "./implementations/undo-commit.js";
import * as unstageAll from "./implementations/unstage-all.js";
// import * as unstageSelectedRanges from "./implementations/unstage-seleted-ranges.js";
import * as unstage from "./implementations/unstage.js";

export function registerCommands(
	model: Model,
	branchFn: (repository: Repository, defaultName?: string, from?: boolean) => Promise<void>,
	checkoutFn: (repository: Repository, opts?: { detached?: boolean, treeish?: string }) => Promise<boolean>,
	cleanTrackedChanges: (repository: Repository, resources: Resource[]) => Promise<void>,
	cleanUntrackedChange: (repository: Repository, resource: Resource) => Promise<void>,
	cleanUntrackedChanges: (repository: Repository, resources: Resource[]) => Promise<void>,
	runByRepository: RunByRepository<void>,
	getSCMResource: (uri?: Uri) => Resource | undefined,
	cloneRepository: (url?: string, parentPath?: string, options?: { recursive?: boolean }) => Promise<void>,
	commitWithAnyInput: (repository: Repository, opts?: CommitOptions) => Promise<void>,
	commitEmptyFn: (repository: Repository, noVerify?: boolean) => Promise<void>,
	git: Git,
	pushFn: (repository: Repository, pushOptions: PushOptions) => Promise<void>,
	promptForBranchName: (defaultName?: string, initialValue?: string) => Promise<string>,
	outputChannel: OutputChannel,
	stageDeletionConflict: (repository: Repository, uri: Uri) => Promise<void>,
	pickStash: (repository: Repository, placeHolder: string) => Promise<Stash | undefined>,
	stashFn: (repository: Repository, includeUntracked?: boolean) => Promise<void>,
	syncFn: (repository: Repository, rebase: boolean) => Promise<void>,
) {
	const commands: ScmCommand[] = [
		branchFrom.createCommand(branchFn),
		branch.createCommand(branchFn),
		checkoutDetached.createCommand(checkoutFn),
		checkout.createCommand(checkoutFn),
		cherryPick.createCommand(),
		cleanAllTracked.createCommand(cleanTrackedChanges),
		cleanAllUntracked.createCommand(cleanUntrackedChange, cleanUntrackedChanges),
		cleanAll.createCommand(cleanTrackedChanges, cleanUntrackedChange, cleanUntrackedChanges),
		clean.createCommand(runByRepository, getSCMResource),
		cloneRecursive.createCommand(cloneRepository),
		clone.createCommand(cloneRepository),
		close.createCommand(model),
		commitAllAmendNoVerify.createCommand(commitWithAnyInput),
		commitAllAmend.createCommand(commitWithAnyInput),
		commitAllNoVerify.createCommand(commitWithAnyInput),
		commitAllSignedNoVerify.createCommand(commitWithAnyInput),
		commitAllSigned.createCommand(commitWithAnyInput),
		commitAll.createCommand(commitWithAnyInput),
		commitEmptyNoVerify.createCommand(commitEmptyFn),
		commitEmpty.createCommand(commitEmptyFn),
		commitStagedAmendNoVerify.createCommand(commitWithAnyInput),
		commitStagedAmend.createCommand(commitWithAnyInput),
		commitStagedNoVerify.createCommand(commitWithAnyInput),
		commitStagedSignedNoVerify.createCommand(commitWithAnyInput),
		commitStagedSigned.createCommand(commitWithAnyInput),
		commitStaged.createCommand(commitWithAnyInput),
		commit.createCommand(commitWithAnyInput),
		createTag.createCommand(),
		deleteBranch.createCommand(),
		deleteTag.createCommand(),
		fetchAll.createCommand(),
		fetchPrune.createCommand(),
		fetch.createCommand(),
		ignore.createCommand(runByRepository, getSCMResource),
		init.createCommand(git, model),
		merge.createCommand(),
		openAllChanges.createCommand(),
		openChange.createCommand(getSCMResource),
		openHeadFile.createCommand(getSCMResource),
		openRepository.createCommand(model),
		openResource.createCommand(model),
		pullFrom.createCommand(),
		pullRebase.createCommand(),
		pull.createCommand(),
		pushForce.createCommand(pushFn),
		pushTags.createCommand(pushFn),
		pushToForce.createCommand(pushFn),
		pushTo.createCommand(pushFn),
		pushWithTagsForce.createCommand(pushFn),
		pushWithTags.createCommand(pushFn),
		push.createCommand(pushFn),
		rebaseAbort.createCommand(),
		rebase.createCommand(),
		refresh.createCommand(),
		removeRemote.createCommand(),
		renameBranch.createCommand(promptForBranchName),
		rename.createCommand(),
		restoreCommitTemplate.createCommand(),
		revealInExplorer.createCommand(),
		setLogLevel.createCommand(outputChannel),
		stageAllMerge.createCommand(stageDeletionConflict),
		stageAllTracked.createCommand(),
		stageAllUntracked.createCommand(),
		stageAll.createCommand(),
		stage.createCommand(getSCMResource, outputChannel, runByRepository, stageDeletionConflict),
		stashApplyLatest.createCommand(),
		stashApply.createCommand(pickStash),
		stashDrop.createCommand(pickStash),
		stashIncludeUntracked.createCommand(stashFn),
		stashPopLatest.createCommand(),
		stashPop.createCommand(pickStash),
		stash.createCommand(stashFn),
		syncRebase.createCommand(syncFn),
		sync.createCommand(syncFn),
		unstage.createCommand(getSCMResource, runByRepository),
	];


	const openFileCmd = openFile.createCommand(getSCMResource);
	commands.push(
		openFileCmd,
		openFile2.createCommand(openFileCmd.method as any),
	);

	const unstageAllCmd = unstageAll.createCommand();
	commands.push(
		unstageAllCmd,
		undoCommit.createCommand(unstageAllCmd.method as any)
	);

	const addRemoteCmd = addRemote.createCommand(model);
	commands.push(
		addRemoteCmd,
		publish.createCommand(model, addRemoteCmd.method as any),
	)

	return commands;
}
