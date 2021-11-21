import { OutputChannel } from "vscode";
import { ScmCommand } from "./helpers.js";
import { Git } from "../git.js";
import { Model } from "../model";

import * as addRemote from "./implementations/remote/add-remote.js";
import * as branchFrom from "./implementations/branch/branch-from.js";
import * as branch from "./implementations/branch/branch.js";
import * as checkoutDetached from "./implementations/checkout/checkout-detached.js";
import * as checkout from "./implementations/checkout/checkout.js";
import * as cherryPick from "./implementations/cherry-pick.js";
import * as cleanAllTracked from "./implementations/clean/clean-all-tracked.js";
import * as cleanAllUntracked from "./implementations/clean/clean-all-untracked.js";
import * as cleanAll from "./implementations/clean/clean-all.js";
import * as clean from "./implementations/clean/clean.js";
import * as cloneRecursive from "./implementations/clone/clone-recursive.js";
import * as clone from "./implementations/clone/clone.js";
import * as close from "./implementations/close.js";
import * as commitAllAmendNoVerify from "./implementations/commit/commit-all-amend-no-verify.js";
import * as commitAllAmend from "./implementations/commit/commit-all-amend.js";
import * as commitAllNoVerify from "./implementations/commit/commit-all-no-verify.js";
import * as commitAllSignedNoVerify from "./implementations/commit/commit-all-signed-no-verify.js";
import * as commitAllSigned from "./implementations/commit/commit-all-signed.js";
import * as commitAll from "./implementations/commit/commit-all.js";
import * as commitEmptyNoVerify from "./implementations/commit/commit-empty-no-verify.js";
import * as commitEmpty from "./implementations/commit/commit-empty.js";
import * as commitNoVerify from "./implementations/commit/commit-no-verify";
import * as commitStagedAmendNoVerify from "./implementations/commit/commit-staged-amend-no-verify.js";
import * as commitStagedAmend from "./implementations/commit/commit-staged-amend.js";
import * as commitStagedNoVerify from "./implementations/commit/commit-staged-no-verify.js";
import * as commitStagedSignedNoVerify from "./implementations/commit/commit-staged-signed-no-verify.js";
import * as commitStagedSigned from "./implementations/commit/commit-staged-signed.js";
import * as commitStaged from "./implementations/commit/commit-staged.js";
import * as commit from "./implementations/commit/commit.js";
import * as createTag from "./implementations/tag/create-tag.js";
import * as deleteBranch from "./implementations/branch/delete-branch.js";
import * as deleteTag from "./implementations/tag/delete-tag.js";
import * as fetchAll from "./implementations/fetch/fetch-all.js";
import * as fetchPrune from "./implementations/fetch/fetch-prune.js";
import * as fetch from "./implementations/fetch/fetch.js";
import * as ignore from "./implementations/ignore.js";
import * as init from "./implementations/init.js";
import * as merge from "./implementations/merge.js";
import * as openAllChanges from "./implementations/open/changes/open-all-changes.js";
import * as openChange from "./implementations/open/changes/open-change.js";
import * as openFile2 from "./implementations/open/file/open-file-2.js";
import * as openFile from "./implementations/open/file/open-file.js";
import * as openHeadFile from "./implementations/open/file/open-head-file.js";
import * as openRepository from "./implementations/open/open-repository.js";
import * as openResource from "./implementations/open/open-resource.js";
import * as publish from "./implementations/publish/publish.js";
import * as pullFrom from "./implementations/pull/pull-from";
import * as pullRebase from "./implementations/pull/pull-rebase.js";
import * as pull from "./implementations/pull/pull.js";
import * as pushForce from "./implementations/push/push-force.js";
import * as pushTags from "./implementations/push/push-tags.js";
import * as pushToForce from "./implementations/push/push-to-force.js";
import * as pushTo from "./implementations/push/push-to.js";
import * as pushWithTagsForce from "./implementations/push/push-with-tags-force.js";
import * as pushWithTags from "./implementations/push/push-with-tags.js";
import * as push from "./implementations/push/push.js";
import * as rebaseAbort from "./implementations/rebase/rebase-abort.js";
import * as rebase from "./implementations/rebase/rebase.js";
import * as refresh from "./implementations/refresh.js";
import * as removeRemote from "./implementations/remote/remove-remote.js";
import * as renameBranch from "./implementations/branch/rename-branch.js";
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
import * as stashApplyLatest from "./implementations/stash/stash-apply-latest.js";
import * as stashApply from "./implementations/stash/stash-apply.js";
import * as stashDrop from "./implementations/stash/stash-drop.js";
import * as stashIncludeUntracked from "./implementations/stash/stash-include-untracked.js";
import * as stashPopLatest from "./implementations/stash/stash-pop-latest.js";
import * as stashPop from "./implementations/stash/stash-pop.js";
import * as stash from "./implementations/stash/stash.js";
import * as syncRebase from "./implementations/sync/sync-rebase.js";
import * as sync from "./implementations/sync/sync.js";
import * as undoCommit from "./implementations/undo-commit.js";
import * as unstageAll from "./implementations/unstage/unstage-all.js";
// import * as unstageSelectedRanges from "./implementations/unstage-seleted-ranges.js";
import * as unstage from "./implementations/unstage/unstage.js";
import TelemetryReporter from "vscode-extension-telemetry";

export function registerCommands(
	model: Model,
	git: Git,
	outputChannel: OutputChannel,
	telemetryReporter: TelemetryReporter,
): ScmCommand[] {
	return [
		addRemote.createCommand(model),
		branch.createCommand(),
		branchFrom.createCommand(),
		checkout.createCommand(),
		checkoutDetached.createCommand(),
		cherryPick.createCommand(),
		clean.createCommand(model, outputChannel),
		cleanAll.createCommand(),
		cleanAllTracked.createCommand(),
		cleanAllUntracked.createCommand(),
		clone.createCommand(model, telemetryReporter, git),
		cloneRecursive.createCommand(model, telemetryReporter, git),
		close.createCommand(model),
		commit.createCommand(model),
		commitAll.createCommand(model),
		commitAllAmend.createCommand(model),
		commitAllAmendNoVerify.createCommand(model),
		commitAllNoVerify.createCommand(model),
		commitAllSigned.createCommand(model),
		commitAllSignedNoVerify.createCommand(model),
		commitEmpty.createCommand(model),
		commitEmptyNoVerify.createCommand(model),
		commitNoVerify.createCommand(model),
		commitStaged.createCommand(model),
		commitStagedAmend.createCommand(model),
		commitStagedAmendNoVerify.createCommand(model),
		commitStagedNoVerify.createCommand(model),
		commitStagedSigned.createCommand(model),
		commitStagedSignedNoVerify.createCommand(model),
		createTag.createCommand(),
		deleteBranch.createCommand(),
		deleteTag.createCommand(),
		fetch.createCommand(),
		fetchAll.createCommand(),
		fetchPrune.createCommand(),
		ignore.createCommand(model, outputChannel),
		init.createCommand(git, model),
		merge.createCommand(),
		openAllChanges.createCommand(),
		openChange.createCommand(model, outputChannel),
		openFile.createCommand(model, outputChannel),
		openFile2.createCommand(model, outputChannel),
		openHeadFile.createCommand(model, outputChannel),
		openRepository.createCommand(model),
		openResource.createCommand(model),
		publish.createCommand(model),
		pull.createCommand(),
		pullFrom.createCommand(),
		pullRebase.createCommand(),
		push.createCommand(model),
		pushForce.createCommand(model),
		pushTags.createCommand(model),
		pushTo.createCommand(model),
		pushToForce.createCommand(model),
		pushWithTags.createCommand(model),
		pushWithTagsForce.createCommand(model),
		rebase.createCommand(),
		rebaseAbort.createCommand(),
		refresh.createCommand(),
		removeRemote.createCommand(),
		rename.createCommand(),
		renameBranch.createCommand(),
		restoreCommitTemplate.createCommand(),
		revealInExplorer.createCommand(),
		setLogLevel.createCommand(outputChannel),
		stage.createCommand(outputChannel, model),
		stageAll.createCommand(),
		stageAllMerge.createCommand(),
		stageAllTracked.createCommand(),
		stageAllUntracked.createCommand(),
		stash.createCommand(),
		stashApply.createCommand(),
		stashApplyLatest.createCommand(),
		stashDrop.createCommand(),
		stashIncludeUntracked.createCommand(),
		stashPop.createCommand(),
		stashPopLatest.createCommand(),
		sync.createCommand(model),
		syncRebase.createCommand(model),
		undoCommit.createCommand(),
		unstage.createCommand(outputChannel, model),
		unstageAll.createCommand(),
	];
}
