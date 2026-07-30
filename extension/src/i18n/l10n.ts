import path from "node:path";
import { l10n, type TextDocument, type Uri } from "vscode";
import type { LogLevelOptions } from "../logging/log.js";
import type { Resource } from "../repository/Resource.js";

export function yes(): string {
    return l10n.t("Yes");
}

export function no(): string {
    return l10n.t("No");
}

export function askLater(): string {
    return l10n.t("Ask Me Later");
}

export function suggestAutoFetch(): string {
    return l10n.t(
        "Would you like Code to [periodically run 'git fetch']({0})?",
        // TODO Documentation should be served from extension
        "https://go.microsoft.com/fwlink/?linkid=865294",
    );
}

export function openGitLog(): string {
    return l10n.t("Open Git Log");
}

export function showCommandOutput(): string {
    return l10n.t("Show Command Output");
}

export function cleanRepo(): string {
    return l10n.t("Please clean your repository working tree before checkout.");
}

export function cantPush(): string {
    return l10n.t(
        "Can't push refs to remote. Try running 'Pull' first to integrate your changes.",
    );
}

export function mergeConflicts(): string {
    return l10n.t("There are merge conflicts. Resolve them before committing.");
}

export function stashMergeConflicts(): string {
    return l10n.t("There were merge conflicts while applying the stash.");
}

export function authFailed(reason?: string): string {
    if (reason) {
        return l10n.t("Failed to authenticate to git remote:\n\n{0}", reason);
    }

    return l10n.t("Failed to authenticate to git remote.");
}

export function missingUserInfo(): string {
    return l10n.t(
        "Make sure you configure your 'user.name' and 'user.email' in git.",
    );
}

export function learnMore(): string {
    return l10n.t("Learn More");
}

export function gitError(hint?: string): string {
    if (hint) {
        return l10n.t("Git: {0}", hint);
    }

    return l10n.t("Git error");
}

export function fallthroughError(): string {
    return l10n.t("An unexpected error occurred.");
}

export function selectBranchToDelete(): string {
    return l10n.t("Select a branch to delete");
}

export function confirmForceDeleteBranch(branchName: string): string {
    return l10n.t(
        "The branch '{0}' is not fully merged. Delete anyway?",
        branchName,
    );
}

export function deleteBranch(): string {
    return l10n.t("Delete Branch");
}

export function commit(): string {
    return l10n.t("Commit");
}

export function mergeChanges(): string {
    return l10n.t("Merge");
}

export function stagedChanges(): string {
    return l10n.t("Staged");
}

export function trackedChanges(): string {
    return l10n.t("Tracked");
}

export function untrackedChanges(): string {
    return l10n.t("Untracked");
}

export function rebasing(): string {
    return l10n.t("Rebasing");
}

export function checkout(): string {
    return l10n.t("Checkout branch/tag...");
}

export function publishChanges(): string {
    return l10n.t("Publish Changes");
}

export function syncingChanges(): string {
    return l10n.t("Synchronizing Changes...");
}

export function gitTitleIndex(fileName: string): string {
    return l10n.t("{0} (Index)", fileName);
}

export function gitTitleWorkingTree(filename: string): string {
    return l10n.t("{0} (Working Tree)", filename);
}

export function gitTitleDeleted(fileName: string): string {
    return l10n.t("{0} (Deleted)", fileName);
}

export function gitTitleTheirs(fileName: string): string {
    return l10n.t("{0} (Theirs)", fileName);
}

export function gitTitleOurs(fileName: string): string {
    return l10n.t("{0} (Ours)", fileName);
}

export function gitTitleUntracked(fileName: string): string {
    return l10n.t("{0} (Untracked)", fileName);
}

export function open(): string {
    return l10n.t("Open");
}

export function syncChanges(): string {
    return l10n.t("Synchronize Changes");
}

export function pullN(commitsBehind: number, upstreamRemote: string, upstreamName: string): string {
    return l10n.t(
        "Pull {0} commits from {1}/{2}",
        commitsBehind,
        upstreamRemote,
        upstreamName,
    );
}

export function pushN(commitsAhead: number, upstreamRemote: string, upstreamName: string): string {
    return l10n.t(
        "Push {0} commits to {1}/{2}",
        commitsAhead,
        upstreamRemote,
        upstreamName,
    );
}

export function pullPushN(
    commitsBehind: number,
    commitsAhead: number,
    upstreamRemote: string,
    upstreamName: string,
): string {
    return l10n.t(
        "Pull {0} and push {1} commits between {2}/{3}",
        commitsBehind,
        commitsAhead,
        upstreamRemote,
        upstreamName,
    );
}

export function syncIsUnpredictable(): string {
    return l10n.t(
        "Syncing. Cancelling may cause serious damages to the repository",
    );
}

export function commitMessageForCommand(branchName?: string): string {
    if (branchName) {
        return l10n.t(
            // '{0}' will be replaced by the corresponding key-command later in the process, which is why it needs to stay.
            "Message ({0} to commit on '{1}')",
            "{0}",
            branchName,
        );
    }

    return l10n.t("Message ({0} to commit)");
}

export function pushSuccess(): string {
    return l10n.t("Successfully pushed.");
}

export function alwaysPull(): string {
    return l10n.t("Always Pull");
}

export function pull(): string {
    return l10n.t("Pull");
}

export function dontPull(): string {
    return l10n.t("Don't Pull");
}

export function pullMaybeRebased(branchName?: string): string {
    if (branchName) {
        return l10n.t(
            "It looks like the current branch '{0}' might have been rebased. Are you sure you still want to pull into it?",
            branchName,
        );
    }

    return l10n.t(
        "It looks like the current branch might have been rebased. Are you sure you still want to pull into it?",
    );
}

export function indexModified(): string {
    return l10n.t("Index Modified");
}

export function modified(): string {
    return l10n.t("Modified");
}

export function indexAdded(): string {
    return l10n.t("Index Added");
}

export function indexDeleted(): string {
    return l10n.t("Index Deleted");
}

export function deleted(): string {
    return l10n.t("Deleted");
}

export function indexRenamed(): string {
    return l10n.t("Index Renamed");
}

export function indexCopied(): string {
    return l10n.t("Index Copied");
}

export function untracked(): string {
    return l10n.t("Untracked");
}

export function ignored(): string {
    return l10n.t("Ignored");
}

export function intentToAdd(): string {
    return l10n.t("Intent to Add");
}

export function bothDeleted(): string {
    return l10n.t("Conflict: Both Deleted");
}

export function addedByUs(): string {
    return l10n.t("Conflict: Added By Us");
}

export function deletedByThem(): string {
    return l10n.t("Conflict: Deleted By Them");
}

export function addedByThem(): string {
    return l10n.t("Conflict: Added By Them");
}

export function deletedByUs(): string {
    return l10n.t("Conflict: Deleted By Us");
}

export function bothAdded(): string {
    return l10n.t("Conflict: Both Added");
}

export function bothModified(): string {
    return l10n.t("Conflict: Both Modified");
}

export function branchName(): string {
    return l10n.t("Branch name");
}

// TODO Too specific in purpose for its name
export function notSupported(): string {
    return l10n.t(
        "Absolute paths not supported in 'git.scanRepositories' setting.",
    );
}

export function tooManySubmodules(repoRoot: string, submodules: number): string {
    return l10n.t(
        "The '{0}' repository has {1} submodules which won't be opened automatically. You can still open each one individually by opening a file within.",
        repoRoot,
        submodules,
    );
}

export function pickRepo(): string {
    return l10n.t("Choose a repository");
}

export function noRepositories(): string {
    return l10n.t("There are no available repositories");
}

export function usingGit(gitVersion: string, gitPath: string): string {
    return l10n.t("Using git {0} from {1}", gitVersion, gitPath);
}

export function downloadGit(): string {
    return l10n.t("Download Git");
}

// TODO Duplicate message, duplicate meaning across all contexts
export function neverShowAgain(): string {
    return l10n.t("Don't Show Again");
}

export function notFound(): string {
    return l10n.t("Git not found. Install it or configure it using the 'git.path' setting.");
}

export function updateGit(): string {
    return l10n.t("Update Git");
}

export function git20(gitVersion: string): string {
    return l10n.t("You seem to have git {0} installed. Code works best with git >= 2", gitVersion);
}

export function git2526(gitVersion: string): string {
    return l10n.t(
        "There are known issues with the installed Git {0}. Please update to Git >= 2.27 for the git features to work correctly.",
        gitVersion,
    );
}

export function noMore(): string {
    return l10n.t("Can't undo because HEAD doesn't point to any commit.");
}

export function undoCommit(): string {
    return l10n.t("Undo merge commit");
}

export function mergeCommit(): string {
    return l10n.t("The last commit was a merge commit. Are you sure you want to undo it?");
}

export function noTags(): string {
    return l10n.t("This repository has no tags.");
}

export function selectTagToDelete(): string {
    return l10n.t("Select a tag to delete");
}

export function tagName(): string {
    return l10n.t("Tag name");
}

export function provideTagName(): string {
    return l10n.t("Please provide a tag name");
}

export function tagMessage(): string {
    return l10n.t("Please provide a tag name");
}

export function provideTagMessage(): string {
    return l10n.t("Please provide a message to annotate the tag");
}

export function confirmPublishBranch(branchName: string): string {
    return l10n.t(
        "The branch '{0}' has no upstream branch. Would you like to publish this branch?",
        branchName,
    );
}

export function ok(): string {
    return l10n.t("OK");
}

export function syncIsUnpredictable2(remotePath: string, remoteName: string): string {
    return l10n.t(
        "This action will push and pull commits to and from '{0}/{1}'.",
        remotePath,
        remoteName,
    );
}

export function neverAgain2(): string {
    return l10n.t("OK, Don't Show Again");
}

export function pickStashToPop(): string {
    return l10n.t("Pick a stash to pop");
}

export function noStashes(): string {
    return l10n.t("There are no stashes in the repository.");
}

export function pickStashToDrop(): string {
    return l10n.t("Pick a stash to drop");
}

export function sureDropStash(description: string): string {
    return l10n.t("Are you sure you want to drop the stash: {0}?", description);
}

export function pickStashToApply(): string {
    return l10n.t("Pick a stash to apply");
}

export function noChangesStash(): string {
    return l10n.t("There are no changes to stash.");
}

export function unsavedStashFiles(documents: TextDocument[]): string {
    if (documents.length === 1) {
        return l10n.t(
            "The following file has unsaved changes which won't be included in the stash if you proceed: {0}.\n\nWould you like to save it before stashing?",
            path.basename(documents[0].fileName),
        );
    }

    return l10n.t(
        "There are {0} unsaved files.\n\nWould you like to save them before stashing?",
        documents.length,
    );
}

export function saveAndStash(): string {
    return l10n.t("Save All & Stash");
}

export function stash(): string {
    return l10n.t("Stash Anyway");
}

export function stashMessage(): string {
    return l10n.t("Stash message");
}

export function provideStashMessage(): string {
    return l10n.t("Optionally provide a stash message");
}

export function confirmStageWithMergeConflicts(unresolved: Resource[]): string {
    if (unresolved.length > 1) {
        return l10n.t(
            "Are you sure you want to stage {0} files with merge conflicts?",
            unresolved.length,
        );
    }

    return l10n.t(
        "Are you sure you want to stage {0} with merge conflicts?",
        path.basename(unresolved[0].state.resourceUri.fsPath),
    );
}

export function keepOurs(): string {
    return l10n.t("Keep Our Version");
}

export function allowDeletion(): string {
    return l10n.t("Delete File");
}

export function stageDeletedByThem(fileUri: Uri): string {
    return l10n.t(
        "File '{0}' was deleted by them and modified by us.\n\nWhat would you like to do?",
        path.basename(fileUri.fsPath),
    );
}

export function keepTheirs(): string {
    return l10n.t("Keep Their Version");
}

export function stageDeletedByUs(fileUri: Uri): string {
    return l10n.t(
        "File '{0}' was deleted by us and modified by them.\n\nWhat would you like to do?",
        path.basename(fileUri.fsPath),
    );
}

export function current(): string {
    return l10n.t("Current");
}

export function selectLogLevel(): string {
    return l10n.t("Select log level");
}

export function logLevelChanged(logLevel: LogLevelOptions): string {
    return l10n.t("Log level changed to: {0}", logLevel);
}

export function noRemotesAdded(): string {
    return l10n.t("Your repository has no remotes.");
}

export function removeRemote(): string {
    return l10n.t("Pick a remote to remove");
}

export function selectRebaseTarget(): string {
    return l10n.t("Select a branch to rebase onto");
}

export function noRebase(): string {
    return l10n.t("No rebase in progress.");
}

export function forcePushNotAllowed(): string {
    return l10n.t(
        "Force push is not allowed, please enable it with the 'git.allowForcePush' setting.",
    );
}

export function confirmForcePush(): string {
    return l10n.t(
        "You are about to force push your changes, this can be destructive and could inadvertently overwrite changes made by others.\n\nAre you sure to continue?",
    );
}

export function noBranch(): string {
    return l10n.t("Please check out a branch to push to a remote.");
}

export function noRemotesToPull(): string {
    return l10n.t("Your repository has no remotes configured to pull from.");
}

export function pickRemotePull(): string {
    return l10n.t("Pick a remote to pull the branch from");
}

export function pickBranchPull(): string {
    return l10n.t("Pick a branch to pull from");
}

export function noRemotesToPublish(): string {
    return l10n.t("Your repository has no remotes configured to publish to.");
}

export function selectRemoteToPublish(): string {
    return l10n.t("Select a remote to publish to.");
}

export function openRepository(): string {
    return l10n.t("Open Repository");
}

export function headNotAvailable(fileUri: Uri): string {
    return l10n.t(
        "HEAD version of '{0}' is not available.",
        path.basename(fileUri.fsPath),
    );
}

export function selectBranchToMerge(): string {
    return l10n.t("Select a branch to merge from");
}

export function initRepository(): string {
    return l10n.t("Pick workspace folder to initialize git repo in");
}

export function chooseFolder(): string {
    return l10n.t("Choose Folder...");
}

export function initRepository2(): string {
    return l10n.t("Initialize Repository");
}

export function initRepositoryConfirm(repoUri: Uri): string {
    return l10n.t(
        "This will create a Git repository in '{0}'. Are you sure you want to continue?",
        repoUri.fsPath,
    );
}

export function proposeOpenInitedRepository(): string {
    return l10n.t("Would you like to open the initialized repository?");
}

export function openRepository2(): string {
    return l10n.t("Open");
}

export function openRepositoryInNewWindow(): string {
    return l10n.t("Open in New Window");
}

export function addToWorkspace(): string {
    return l10n.t("Add to Workspace");
}

export function proposeOpenInitedRepository2(): string {
    return l10n.t(
        "Would you like to open the initialized repository, or add it to the current workspace?",
    );
}

export function noRemotesToFetch(): string {
    return l10n.t("This repository has no remotes configured to fetch from.");
}

export function unsavedCommitFiles(documents: TextDocument[]): string {
    if (documents.length === 1) {
        return l10n.t(
            "The following file has unsaved changes which won't be included in the commit if you proceed: {0}.\n\nWould you like to save it before committing?",
            path.basename(documents[0].uri.fsPath),
        );
    }

    return l10n.t(
        "There are {0} unsaved files.\n\nWould you like to save them before committing?",
        documents.length,
    );
}

export function saveAndCommit(): string {
    return l10n.t("Save All & Commit");
}

export function commitStaged(): string {
    return l10n.t("Commit Staged Changes");
}

export function noStagedChanges(): string {
    return l10n.t(
        "There are no staged changes to commit.\n\nWould you like to stage all your changes and commit them directly?",
    );
}

export function always(): string {
    return l10n.t("Always");
}

export function never(): string {
    return l10n.t("Never");
}

export function commitAnyway(): string {
    return l10n.t("Create Empty Commit");
}

export function noChanges(): string {
    return l10n.t("There are no changes to commit.");
}

export function commitRequiresVerification(): string {
    return l10n.t(
        "Commits without verification are not allowed, please enable them with the 'git.allowNoVerifyCommit' setting.",
    );
}

export function confirmCommitWithoutVerification(): string {
    return l10n.t(
        "You are about to commit your changes without verification, this skips pre-commit hooks and can be undesirable.\n\nAre you sure to continue?",
    );
}

export function neverAgain3(): string {
    return l10n.t("OK, Don't Ask Again");
}

export function commitMessage(branchName?: string): string {
    if (branchName) {
        return l10n.t("Message (commit on '{0}')", branchName);
    }

    return l10n.t("Commit message");
}

export function provideCommitMessage(): string {
    return l10n.t("Please provide a commit message");
}

export function confirmEmptyCommit(): string {
    return l10n.t("Are you sure you want to create an empty commit?");
}

export function yesNeverAgain(): string {
    return l10n.t("Yes, Don't Show Again");
}

export function selectRepositoryFolder(): string {
    return l10n.t("Select Repository Location");
}

export function cloning(remoteUrl: string): string {
    return l10n.t("Cloning git repository '{0}'...", remoteUrl);
}

export function proposeOpenClonedRepository(): string {
    return l10n.t("Would you like to open the cloned repository?");
}

export function proposeOpenClonedRepository2(): string {
    return l10n.t(
        "Would you like to open the cloned repository, or add it to the current workspace?",
    );
}

export function confirmDelete(files: readonly Resource[]): string {
    if (files.length === 1) {
        l10n.t(
            "Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return l10n.t(
        "Are you sure you want to DELETE {0} files?\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST if you proceed.",
        files.length,
    );
}

export function deleteFiles(): string {
    return l10n.t("Delete Files");
}

export function deleteFile(): string {
    return l10n.t("Delete file");
}

export function cleanTrackedChanges(files: readonly Resource[]): string {
    if (files.length === 1) {
        return l10n.t(
            "Are you sure you want to discard changes in {0}?",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return l10n.t(
        "Are you sure you want to discard ALL changes in {0} files?\nThis is IRREVERSIBLE!\nYour current working set will be FOREVER LOST if you proceed.",
        files.length,
    );
}

export function discardTracked(files: readonly Resource[]): string {
    if (files.length === 1) {
        return l10n.t("Discard 1 File");
    }

    return l10n.t("Discard All {0} Files", files.length);
}

export function discard(): string {
    return l10n.t("Discard Changes");
}

export function restoreFile(): string {
    return l10n.t("Restore file");
}

export function restoreFiles(): string {
    return l10n.t("Restore files");
}

export function confirmRestoreFiles(files: readonly Resource[]): string {
    if (files.length === 1) {
        return l10n.t(
            "Are you sure you want to restore {0}?",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return l10n.t(
        "Are you sure you want to restore {0} files?",
        files.length,
    );
}

export function confirmDiscard(files: readonly Resource[]): string {
    if (files.length === 1) {
        return l10n.t(
            "Are you sure you want to discard changes in {0}?",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return l10n.t(
        "Are you sure you want to discard changes in {0} files?",
        files.length,
    );
}

export function warnUntracked(untracked: number): string {
    return l10n.t(
        "This will DELETE {0} untracked files!\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST.",
        untracked,
    );
}

export function warnUntracked2(untrackedFiles: readonly Resource[]): string {
    if (untrackedFiles.length === 1) {
        return l10n.t(
            "The following untracked file will be DELETED FROM DISK if discarded: {0}.",
            path.basename(untrackedFiles[0].state.resourceUri.fsPath),
        );
    }

    return l10n.t(
        "There are {0} untracked files which will be DELETED FROM DISK if discarded.",
        untrackedFiles.length,
    );
}

export function confirmDiscard2(message: string, untrackedFiles: readonly Resource[]): string {
    return l10n.t(
        "{0}\n\nThis is IRREVERSIBLE, your current working set will be FOREVER LOST.",
        message,
        untrackedFiles.length,
    );
}

export function confirmDiscardTracked(trackedFiles: readonly Resource[]): string {
    if (trackedFiles.length === 1) {
        return l10n.t("Discard 1 Tracked File");
    }

    return l10n.t("Discard {0} Tracked Files", trackedFiles.length);
}

export function discardAll(files: readonly Resource[]): string {
    return l10n.t("Discard All {0} Files", files.length);
}

export function commitHash(): string {
    return l10n.t("Commit Hash");
}

export function provideCommitHash(): string {
    return l10n.t("Please provide the commit hash");
}

export function tagAt(shortCommit: string): string {
    return l10n.t("Tag at {0}", shortCommit);
}

export function remoteBranchAt(shortCommit: string): string {
    return l10n.t("Remote branch at {0}", shortCommit);
}

export function checkoutDetached(): string {
    return l10n.t("Checkout detached...");
}

export function selectRefToCheckout(): string {
    return l10n.t("Select a ref to checkout");
}

export function selectRefToCheckoutDetached(): string {
    return l10n.t("Select a ref to checkout in detached mode");
}

export function forceCheckout(): string {
    return l10n.t("Force Checkout");
}

export function stashAndCheckout(): string {
    return l10n.t("Stash & Checkout");
}

export function localChanges(): string {
    return l10n.t("Your local changes would be overwritten by checkout.");
}

export function invalidBranchName(): string {
    return l10n.t("Invalid branch name");
}

export function branchAlreadyExists(branchName: string): string {
    return l10n.t("A branch named '{0}' already exists", branchName);
}

export function createBranch(): string {
    return l10n.t("Create new branch...");
}

export function createBranchFrom(): string {
    return l10n.t("Create new branch from...");
}

export function provideBranchName(): string {
    return l10n.t("Please provide a new branch name");
}

export function branchNameFormatInvalid(branchValidationRegex: string): string {
    return l10n.t(
        "Branch name needs to match regex: {0}",
        branchValidationRegex,
    );
}

export function selectRefToBranchFrom(branchName: string): string {
    return l10n.t(
        "Select a ref to create the '{0}' branch from",
        branchName,
    );
}
