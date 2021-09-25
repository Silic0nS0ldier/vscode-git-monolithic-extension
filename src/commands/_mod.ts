import { OutputChannel, Uri } from "vscode";
import { CommitOptions } from "../api/git";
import { PushOptions, RunByRepository, ScmCommand } from "../commands";
import { Git, Stash } from "../git.js";
import { Model } from "../model";
import { Repository, Resource } from "../repository.js";

import * as addRemote from "./add-remote.js";
import * as branchFrom from "./branch-from.js";
import * as branch from "./branch.js";
import * as checkoutDetached from "./checkout-detached.js";
import * as checkout from "./checkout.js";
import * as cherryPick from "./cherry-pick.js";
import * as cleanAllTracked from "./clean-all-tracked.js";
import * as cleanAllUntracked from "./clean-all-untracked.js";
import * as cleanAll from "./clean-all.js";
import * as clean from "./clean.js";
import * as cloneRecursive from "./clone-recursive.js";
import * as clone from "./clone.js";
import * as close from "./close.js";
import * as commitAllAmendNoVerify from "./commit-all-amend-no-verify.js";
import * as commitAllAmend from "./commit-all-amend.js";
import * as commitAllNoVerify from "./commit-all-no-verify.js";
import * as commitAllSignedNoVerify from "./commit-all-signed-no-verify.js";
import * as commitAllSigned from "./commit-all-signed.js";
import * as commitAll from "./commit-all.js";
import * as commitEmptyNoVerify from "./commit-empty-no-verify.js";
import * as commitEmpty from "./commit-empty.js";
import * as commitStagedAmendNoVerify from "./commit-staged-amend-no-verify.js";
import * as commitStagedAmend from "./commit-staged-amend.js";
import * as commitStagedNoVerify from "./commit-staged-no-verify.js";
import * as commitStagedSignedNoVerify from "./commit-staged-signed-no-verify.js";
import * as commitStagedSigned from "./commit-staged-signed.js";
import * as commitStaged from "./commit-staged.js";
import * as commit from "./commit.js";
import * as createTag from "./create-tag.js";
import * as deleteBranch from "./delete-branch.js";
import * as deleteTag from "./delete-tag.js";
import * as fetchAll from "./fetch-all.js";
import * as fetchPrune from "./fetch-prune.js";
import * as fetch from "./fetch.js";
import * as ignore from "./ignore.js";
import * as init from "./init.js";
import * as merge from "./merge.js";
import * as openAllChanges from "./open-all-changes.js";
import * as openChange from "./open-change.js";
import * as openFile2 from "./open-file-2.js";
import * as openFile from "./open-file.js";
import * as openHeadFile from "./open-head-file.js";
import * as openRepository from "./open-repository.js";
import * as openResource from "./open-resource.js";
import * as publish from "./publish.js";
import * as pullFrom from "./pull-from";
import * as pullRebase from "./pull-rebase.js";
import * as pull from "./pull.js";
import * as pushForce from "./push-force.js";
import * as pushTags from "./push-tags.js";
import * as pushToForce from "./push-to-force.js";
import * as pushTo from "./push-to.js";
import * as pushWithTagsForce from "./push-with-tags-force.js";
import * as pushWithTags from "./push-with-tags.js";
import * as push from "./push.js";
import * as rebaseAbort from "./rebase-abort.js";
import * as rebase from "./rebase.js";
import * as refresh from "./refresh.js";
import * as removeRemote from "./remove-remote.js";
import * as renameBranch from "./rename-branch.js";
import * as rename from "./rename.js";
import * as restoreCommitTemplate from "./restore-commit-template.js";
import * as revealInExplorer from "./reveal-in-explorer.js";
// import * as revertChange from "./revert-change.js";
// import * as revertSelectedRanges from "./revert-selected-ranges.js";
import * as setLogLevel from "./set-log-level.js";
import * as stageAllMerge from "./stage-all-merge.js";
import * as stageAllTracked from "./stage-all-tracked.js";
import * as stageAllUntracked from "./stage-all-untracked.js";
import * as stageAll from "./stage-all.js";
// import * as stageChange from "./stage-change.js";
// import * as stageSelectedRanges from "./stage-selected-ranges.js";
import * as stage from "./stage.js";
import * as stashApplyLatest from "./stash-apply-latest.js";
import * as stashApply from "./stash-apply.js";
import * as stashDrop from "./stash-drop.js";
import * as stashIncludeUntracked from "./stash-include-untracked.js";
import * as stashPopLatest from "./stash-pop-latest.js";
import * as stashPop from "./stash-pop.js";
import * as stash from "./stash.js";
import * as syncRebase from "./sync-rebase.js";
import * as sync from "./sync.js";
import * as undoCommit from "./undo-commit.js";
import * as unstageAll from "./unstage-all.js";
// import * as unstageSelectedRanges from "./unstage-seleted-ranges.js";
import * as unstage from "./unstage.js";

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
