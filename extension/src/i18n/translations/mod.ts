import path from "node:path";
import type { TextDocument, Uri } from "vscode";
import * as nls from "vscode-nls";
import type { LogLevelOptions } from "../../logging/log.js";
import type { Resource } from "../../repository/Resource.js";

// TODO Inline this, see https://github.com/microsoft/vscode-nls/blob/main/src/common/common.ts#L100
const localize = nls.loadMessageBundle();

export function missOrInvalid(): string {
    return localize("missOrInvalid", "Missing or invalid credentials.");
}

export function yes(): string {
    return localize("yes", "Yes");
}

export function no(): string {
    return localize("no", "No");
}

export function askLater(): string {
    return localize("not now", "Ask Me Later");
}

export function suggestAutoFetch(): string {
    return localize(
        "suggest auto fetch",
        "Would you like Code to [periodically run 'git fetch']({0})?",
        // TODO Documentation should be served from extension
        "https://go.microsoft.com/fwlink/?linkid=865294",
    );
}

export function openGitLog(): string {
    return localize("open git log", "Open Git Log");
}

export function showCommandOutput(): string {
    return localize("show command output", "Show Command Output");
}

export function cleanRepo(): string {
    return localize("clean repo", "Please clean your repository working tree before checkout.");
}

export function cantPush(): string {
    return localize(
        "cant push",
        "Can't push refs to remote. Try running 'Pull' first to integrate your changes.",
    );
}

export function mergeConflicts(): string {
    return localize("merge conflicts", "There are merge conflicts. Resolve them before committing.");
}

export function stashMergeConflicts(): string {
    return localize("stash merge conflicts", "There were merge conflicts while applying the stash.");
}

export function authFailed(reason?: string): string {
    if (reason) {
        return localize("auth failed specific", "Failed to authenticate to git remote:\n\n{0}", reason);
    }

    return localize("auth failed", "Failed to authenticate to git remote.");
}

export function missingUserInfo(): string {
    return localize(
        "missing user info",
        "Make sure you configure your 'user.name' and 'user.email' in git.",
    );
}

export function learnMore(): string {
    return localize("learn more", "Learn More");
}

export function gitError(hint?: string): string {
    if (hint) {
        return localize("git error details", "Git: {0}", hint);
    }

    return localize("git error", "Git error");
}

export function fallthroughError(): string {
    return localize("fallthrough error", "An unexpected error occurred.");
}

export function selectBranchToDelete(): string {
    return localize("select branch to delete", "Select a branch to delete");
}

export function confirmForceDeleteBranch(branchName: string): string {
    return localize(
        "confirm force delete branch",
        "The branch '{0}' is not fully merged. Delete anyway?",
        branchName,
    );
}

export function deleteBranch(): string {
    return localize("delete branch", "Delete Branch");
}

export function commit(): string {
    return localize("commit", "Commit");
}

export function mergeChanges(): string {
    return localize("merge changes", "Merge");
}

export function stagedChanges(): string {
    return localize("staged changes", "Staged");
}

export function trackedChanges(): string {
    return localize("tracked changes", "Tracked");
}

export function untrackedChanges(): string {
    return localize("untracked changes", "Untracked");
}

export function rebasing(): string {
    return localize("rebasing", "Rebasing");
}

export function checkout(): string {
    return localize("checkout", "Checkout branch/tag...");
}

export function publishTo(remoteName?: string): string {
    if (remoteName) {
        return localize("publish to", "Publish to {0}", remoteName);
    }

    return localize("publish to...", "Publish to...");
}

export function publishChanges(): string {
    return localize("publish changes", "Publish Changes");
}

export function syncingChanges(): string {
    return localize("syncing changes", "Synchronizing Changes...");
}

export function gitTitleIndex(fileName: string): string {
    return localize("git.title.index", "{0} (Index)", fileName);
}

export function gitTitleWorkingTree(filename: string): string {
    return localize("git.title.workingTree", "{0} (Working Tree)", filename);
}

export function gitTitleDeleted(fileName: string): string {
    return localize("git.title.deleted", "{0} (Deleted)", fileName);
}

export function gitTitleTheirs(fileName: string): string {
    return localize("git.title.theirs", "{0} (Theirs)", fileName);
}

export function gitTitleOurs(fileName: string): string {
    return localize("git.title.ours", "{0} (Ours)", fileName);
}

export function gitTitleUntracked(fileName: string): string {
    return localize("git.title.untracked", "{0} (Untracked)", fileName);
}

export function open(): string {
    return localize("open", "Open");
}

export function tooManyChanges(repoRoot: string): string {
    return localize(
        "huge",
        "The git repository at '{0}' has too many active changes, only a subset of Git features will be enabled.",
        repoRoot,
    );
}

export function neverAgain(): string {
    return localize("neveragain", "Don't Show Again");
}

export function addKnown(folderName: string): string {
    return localize("add known", "Would you like to add '{0}' to .gitignore?", folderName);
}

export function syncChanges(): string {
    return localize("sync changes", "Synchronize Changes");
}

export function pullN(commitsBehind: number, upstreamRemote: string, upstreamName: string): string {
    return localize(
        "pull n",
        "Pull {0} commits from {1}/{2}",
        commitsBehind,
        upstreamRemote,
        upstreamName,
    );
}

export function pushN(commitsAhead: number, upstreamRemote: string, upstreamName: string): string {
    return localize(
        "push n",
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
    return localize(
        "pull push n",
        "Pull {0} and push {1} commits between {2}/{3}",
        commitsBehind,
        commitsAhead,
        upstreamRemote,
        upstreamName,
    );
}

export function syncIsUnpredictable(): string {
    return localize(
        "sync is unpredictable",
        "Syncing. Cancelling may cause serious damages to the repository",
    );
}

export function commitMessageForCommand(branchName?: string): string {
    if (branchName) {
        return localize(
            "commitMessageWithHeadLabel",
            // '{0}' will be replaced by the corresponding key-command later in the process, which is why it needs to stay.
            "Message ({0} to commit on '{1}')",
            "{0}",
            branchName,
        );
    }

    return localize("commitMessage", "Message ({0} to commit)");
}

export function pushSuccess(): string {
    return localize("push success", "Successfully pushed.");
}

export function alwaysPull(): string {
    return localize("always pull", "Always Pull");
}

export function pull(): string {
    return localize("pull", "Pull");
}

export function dontPull(): string {
    return localize("dont pull", "Don't Pull");
}

export function pullMaybeRebased(branchName?: string): string {
    if (branchName) {
        return localize(
            "pull branch maybe rebased",
            "It looks like the current branch '{0}' might have been rebased. Are you sure you still want to pull into it?",
            branchName,
        );
    }

    return localize(
        "pull maybe rebased",
        "It looks like the current branch might have been rebased. Are you sure you still want to pull into it?",
    );
}

export function indexModified(): string {
    return localize("index modified", "Index Modified");
}

export function modified(): string {
    return localize("modified", "Modified");
}

export function indexAdded(): string {
    return localize("index added", "Index Added");
}

export function indexDeleted(): string {
    return localize("index deleted", "Index Deleted");
}

export function deleted(): string {
    return localize("deleted", "Deleted");
}

export function indexRenamed(): string {
    return localize("index renamed", "Index Renamed");
}

export function indexCopied(): string {
    return localize("index copied", "Index Copied");
}

export function untracked(): string {
    return localize("untracked", "Untracked");
}

export function ignored(): string {
    return localize("ignored", "Ignored");
}

export function intentToAdd(): string {
    return localize("intent to add", "Intent to Add");
}

export function bothDeleted(): string {
    return localize("both deleted", "Conflict: Both Deleted");
}

export function addedByUs(): string {
    return localize("added by us", "Conflict: Added By Us");
}

export function deletedByThem(): string {
    return localize("deleted by them", "Conflict: Deleted By Them");
}

export function addedByThem(): string {
    return localize("added by them", "Conflict: Added By Them");
}

export function deletedByUs(): string {
    return localize("deleted by us", "Conflict: Deleted By Us");
}

export function bothAdded(): string {
    return localize("both added", "Conflict: Both Added");
}

export function bothModified(): string {
    return localize("both modified", "Conflict: Both Modified");
}

export function typeToSearch(): string {
    return localize("type to search", "Repository name (type to search)");
}

export function typeToFilter(): string {
    return localize("type to filter", "Repository name");
}

export function noneFound(): string {
    return localize("none found", "No remote repositories found.");
}

export function error(err: string): string {
    return localize("error", "$(error) Error: {0}", err);
}

export function pickUrl(): string {
    return localize("pick url", "Choose a URL to clone from.");
}

export function branchName(): string {
    return localize("branch name", "Branch name");
}

export function provideUrl(): string {
    return localize("provide url", "Provide repository URL");
}

export function provideUrlOrPick(): string {
    return localize("provide url or pick", "Provide repository URL or pick a repository source.");
}

export function url(): string {
    return localize("url", "URL");
}

// TODO Too specific in purpose for its name
export function notSupported(): string {
    return localize(
        "not supported",
        "Absolute paths not supported in 'git.scanRepositories' setting.",
    );
}

export function tooManySubmodules(repoRoot: string, submodules: number): string {
    return localize(
        "too many submodules",
        "The '{0}' repository has {1} submodules which won't be opened automatically. You can still open each one individually by opening a file within.",
        repoRoot,
        submodules,
    );
}

export function pickRepo(): string {
    return localize("pick repo", "Choose a repository");
}

export function noRepositories(): string {
    return localize("no repositories", "There are no available repositories");
}

export function usingGit(gitVersion: string, gitPath: string): string {
    return localize("using git", "Using git {0} from {1}", gitVersion, gitPath);
}

export function downloadGit(): string {
    return localize("downloadgit", "Download Git");
}

// TODO Duplicate message, duplicate meaning across all contexts
export function neverShowAgain(): string {
    return localize("neverShowAgain", "Don't Show Again");
}

export function notFound(): string {
    return localize("notfound", "Git not found. Install it or configure it using the 'git.path' setting.");
}

export function updateGit(): string {
    return localize("updateGit", "Update Git");
}

export function git20(gitVersion: string): string {
    return localize("git20", "You seem to have git {0} installed. Code works best with git >= 2", gitVersion);
}

export function git2526(gitVersion: string): string {
    return localize(
        "git2526",
        "There are known issues with the installed Git {0}. Please update to Git >= 2.27 for the git features to work correctly.",
        gitVersion,
    );
}

export function noMore(): string {
    return localize("no more", "Can't undo because HEAD doesn't point to any commit.");
}

export function undoCommit(): string {
    return localize("undo commit", "Undo merge commit");
}

export function mergeCommit(): string {
    return localize("merge commit", "The last commit was a merge commit. Are you sure you want to undo it?");
}

export function noTags(): string {
    return localize("no tags", "This repository has no tags.");
}

export function selectTagToDelete(): string {
    return localize("select a tag to delete", "Select a tag to delete");
}

export function tagName(): string {
    return localize("tag name", "Tag name");
}

export function provideTagName(): string {
    return localize("provide tag name", "Please provide a tag name");
}

export function tagMessage(): string {
    return localize("provide tag name", "Please provide a tag name");
}

export function provideTagMessage(): string {
    return localize("provide tag message", "Please provide a message to annotate the tag");
}

export function confirmPublishBranch(branchName: string): string {
    return localize(
        "confirm publish branch",
        "The branch '{0}' has no upstream branch. Would you like to publish this branch?",
        branchName,
    );
}

export function ok(): string {
    return localize("ok", "OK");
}

export function syncIsUnpredictable2(remotePath: string, remoteName: string): string {
    return localize(
        "sync is unpredictable 2",
        "This action will push and pull commits to and from '{0}/{1}'.",
        remotePath,
        remoteName,
    );
}

export function neverAgain2(): string {
    return localize("never again 2", "OK, Don't Show Again");
}

export function pickStashToPop(): string {
    return localize("pick stash to pop", "Pick a stash to pop");
}

export function noStashes(): string {
    return localize("no stashes", "There are no stashes in the repository.");
}

export function pickStashToDrop(): string {
    return localize("pick stash to drop", "Pick a stash to drop");
}

export function sureDropStash(description: string): string {
    return localize("sure drop", "Are you sure you want to drop the stash: {0}?", description);
}

export function pickStashToApply(): string {
    return localize("pick stash to apply", "Pick a stash to apply");
}

export function noChangesStash(): string {
    return localize("no changes stash", "There are no changes to stash.");
}

export function unsavedStashFiles(documents: TextDocument[]): string {
    if (documents.length === 1) {
        return localize(
            "unsaved stash files single",
            "The following file has unsaved changes which won't be included in the stash if you proceed: {0}.\n\nWould you like to save it before stashing?",
            path.basename(documents[0].fileName),
        );
    }

    return localize(
        "unsaved stash files",
        "There are {0} unsaved files.\n\nWould you like to save them before stashing?",
        documents.length,
    );
}

export function saveAndStash(): string {
    return localize("save and stash", "Save All & Stash");
}

export function stash(): string {
    return localize("stash", "Stash Anyway");
}

export function stashMessage(): string {
    return localize("stash message", "Stash message");
}

export function provideStashMessage(): string {
    return localize("provide stash message", "Optionally provide a stash message");
}

export function confirmStageWithMergeConflicts(unresolved: Resource[]): string {
    if (unresolved.length > 1) {
        return localize(
            "confirm stage files with merge conflicts",
            "Are you sure you want to stage {0} files with merge conflicts?",
            unresolved.length,
        );
    }

    return localize(
        "confirm stage file with merge conflicts",
        "Are you sure you want to stage {0} with merge conflicts?",
        path.basename(unresolved[0].state.resourceUri.fsPath),
    );
}

export function keepOurs(): string {
    return localize("keep ours", "Keep Our Version");
}

export function allowDeletion(): string {
    return localize("delete", "Delete File");
}

export function stageDeletedByThem(fileUri: Uri): string {
    return localize(
        "deleted by them",
        "File '{0}' was deleted by them and modified by us.\n\nWhat would you like to do?",
        path.basename(fileUri.fsPath),
    );
}

export function keepTheirs(): string {
    return localize("keep theirs", "Keep Their Version");
}

export function stageDeletedByUs(fileUri: Uri): string {
    return localize(
        "deleted by us",
        "File '{0}' was deleted by us and modified by them.\n\nWhat would you like to do?",
        path.basename(fileUri.fsPath),
    );
}

export function current(): string {
    return localize("current", "Current");
}

export function selectLogLevel(): string {
    return localize("select log level", "Select log level");
}

export function logLevelChanged(logLevel: LogLevelOptions): string {
    return localize("changed", "Log level changed to: {0}", logLevel);
}

export function noRemotesAdded(): string {
    return localize("no remotes added", "Your repository has no remotes.");
}

export function removeRemote(): string {
    return localize("remove remote", "Pick a remote to remove");
}

export function addRemoteFrom(remoteName: string): string {
    return localize("add remote from", "Add remote from {0}", remoteName);
}

export function addRemoteFromLabel(): string {
    return localize("add remote from label", "Add remote from URL");
}

export function remoteName(): string {
    return localize("remote name", "Remote name");
}

export function provideRemoteName(): string {
    return localize("provide remote name", "Please provide a remote name");
}

export function remoteNameFormatInvalid(): string {
    return localize("remote name format invalid", "Remote name format invalid");
}

export function remoteAlreadyExists(remoteName: string): string {
    return localize("remote already exists", "Remote '{0}' already exists.", remoteName);
}

export function selectRebaseTarget(): string {
    return localize("select a branch to rebase onto", "Select a branch to rebase onto");
}

export function noRebase(): string {
    return localize("no rebase", "No rebase in progress.");
}

export function noRemotesToPush(): string {
    return localize("no remotes to push", "Your repository has no remotes configured to push to.");
}

export function forcePushNotAllowed(): string {
    return localize(
        "force push not allowed",
        "Force push is not allowed, please enable it with the 'git.allowForcePush' setting.",
    );
}

export function confirmForcePush(): string {
    return localize(
        "confirm force push",
        "You are about to force push your changes, this can be destructive and could inadvertently overwrite changes made by others.\n\nAre you sure to continue?",
    );
}

export function noBranch(): string {
    return localize("nobranch", "Please check out a branch to push to a remote.");
}

export function pickRemote(branchName: string): string {
    return localize("pick remote", "Pick a remote to publish the branch '{0}' to:", branchName);
}

export function noRemotesToPull(): string {
    return localize("no remotes to pull", "Your repository has no remotes configured to pull from.");
}

export function pickRemotePull(): string {
    return localize("pick remote pull repo", "Pick a remote to pull the branch from");
}

export function pickBranchPull(): string {
    return localize("pick branch pull", "Pick a branch to pull from");
}

export function addRemote2(): string {
    return localize("add remote", "Add a new remote...");
}

export function noRemotesToPublish(): string {
    return localize("no remotes to publish", "Your repository has no remotes configured to publish to.");
}

export function selectRemoteToPublish(): string {
    return localize("select remote to publish", "Select a remote to publish to.");
}

export function openRepository(): string {
    return localize("open repo", "Open Repository");
}

export function headNotAvailable(fileUri: Uri): string {
    return localize(
        "HEAD not available",
        "HEAD version of '{0}' is not available.",
        path.basename(fileUri.fsPath),
    );
}

export function selectBranchToMerge(): string {
    return localize("select a branch to merge from", "Select a branch to merge from");
}

export function initRepository(): string {
    return localize("init", "Pick workspace folder to initialize git repo in");
}

export function chooseFolder(): string {
    return localize("choose", "Choose Folder...");
}

export function initRepository2(): string {
    return localize("init repo", "Initialize Repository");
}

export function initRepositoryConfirm(repoUri: Uri): string {
    return localize(
        "are you sure",
        "This will create a Git repository in '{0}'. Are you sure you want to continue?",
        repoUri.fsPath,
    );
}

export function proposeOpenInitedRepository(): string {
    return localize("proposeopen init", "Would you like to open the initialized repository?");
}

export function openRepository2(): string {
    return localize("openrepo", "Open");
}

export function openRepositoryInNewWindow(): string {
    return localize("openreponew", "Open in New Window");
}

export function addToWorkspace(): string {
    return localize("add", "Add to Workspace");
}

export function proposeOpenInitedRepository2(): string {
    return localize(
        "proposeopen2 init",
        "Would you like to open the initialized repository, or add it to the current workspace?",
    );
}

export function noRemotesToFetch(): string {
    return localize("no remotes to fetch", "This repository has no remotes configured to fetch from.");
}

export function unsavedCommitFiles(documents: TextDocument[]): string {
    if (documents.length === 1) {
        return localize(
            "unsaved files single",
            "The following file has unsaved changes which won't be included in the commit if you proceed: {0}.\n\nWould you like to save it before committing?",
            path.basename(documents[0].uri.fsPath),
        );
    }

    return localize(
        "unsaved files",
        "There are {0} unsaved files.\n\nWould you like to save them before committing?",
        documents.length,
    );
}

export function saveAndCommit(): string {
    return localize("save and commit", "Save All & Commit");
}

export function commitStaged(): string {
    return localize("commit", "Commit Staged Changes");
}

export function noStagedChanges(): string {
    return localize(
        "no staged changes",
        "There are no staged changes to commit.\n\nWould you like to stage all your changes and commit them directly?",
    );
}

export function always(): string {
    return localize("always", "Always");
}

export function never(): string {
    return localize("never", "Never");
}

export function commitAnyway(): string {
    return localize("commit anyway", "Create Empty Commit");
}

export function noChanges(): string {
    return localize("no changes", "There are no changes to commit.");
}

export function commitRequiresVerification(): string {
    return localize(
        "no verify commit not allowed",
        "Commits without verification are not allowed, please enable them with the 'git.allowNoVerifyCommit' setting.",
    );
}

export function confirmCommitWithoutVerification(): string {
    return localize(
        "confirm no verify commit",
        "You are about to commit your changes without verification, this skips pre-commit hooks and can be undesirable.\n\nAre you sure to continue?",
    );
}

export function neverAgain3(): string {
    return localize("never ask again", "OK, Don't Ask Again");
}

export function commitMessage(branchName?: string): string {
    if (branchName) {
        return localize("commitMessageWithHeadLabel2", "Message (commit on '{0}')", branchName);
    }

    return localize("commit message", "Commit message");
}

export function provideCommitMessage(): string {
    return localize("provide commit message", "Please provide a commit message");
}

export function confirmEmptyCommit(): string {
    return localize("confirm emtpy commit", "Are you sure you want to create an empty commit?");
}

export function yesNeverAgain(): string {
    return localize("yes never again", "Yes, Don't Show Again");
}

export function cloneFrom(remoteName: string): string {
    return localize("clonefrom", "Clone from {0}", remoteName);
}

export function cloneUrl(): string {
    return localize("repourl", "Clone from URL");
}

export function selectRepositoryFolder(): string {
    return localize("selectFolder", "Select Repository Location");
}

export function cloning(remoteUrl: string): string {
    return localize("cloning", "Cloning git repository '{0}'...", remoteUrl);
}

export function proposeOpenClonedRepository(): string {
    return localize("proposeopen", "Would you like to open the cloned repository?");
}

export function proposeOpenClonedRepository2(): string {
    return localize(
        "proposeopen2",
        "Would you like to open the cloned repository, or add it to the current workspace?",
    );
}

export function confirmDelete(files: readonly Resource[]): string {
    if (files.length === 1) {
        localize(
            "confirm delete",
            "Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return localize(
        "confirm delete multiple",
        "Are you sure you want to DELETE {0} files?\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST if you proceed.",
        files.length,
    );
}

export function deleteFiles(): string {
    return localize("delete files", "Delete Files");
}

export function deleteFile(): string {
    return localize("delete file", "Delete file");
}

export function cleanTrackedChanges(files: readonly Resource[]): string {
    if (files.length === 1) {
        return localize(
            "confirm discard all single",
            "Are you sure you want to discard changes in {0}?",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return localize(
        "confirm discard all",
        "Are you sure you want to discard ALL changes in {0} files?\nThis is IRREVERSIBLE!\nYour current working set will be FOREVER LOST if you proceed.",
        files.length,
    );
}

export function discardTracked(files: readonly Resource[]): string {
    if (files.length === 1) {
        return localize("discardAll multiple", "Discard 1 File");
    }

    return localize("discardAll", "Discard All {0} Files", files.length);
}

export function discard(): string {
    return localize("discard", "Discard Changes");
}

export function restoreFile(): string {
    return localize("restore file", "Restore file");
}

export function restoreFiles(): string {
    return localize("restore files", "Restore files");
}

export function confirmRestoreFiles(files: readonly Resource[]): string {
    if (files.length === 1) {
        return localize(
            "confirm restore",
            "Are you sure you want to restore {0}?",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return localize(
        "confirm restore multiple",
        "Are you sure you want to restore {0} files?",
        files.length,
    );
}

export function confirmDiscard(files: readonly Resource[]): string {
    if (files.length === 1) {
        return localize(
            "confirm discard",
            "Are you sure you want to discard changes in {0}?",
            path.basename(files[0].state.resourceUri.fsPath),
        );
    }

    return localize(
        "confirm discard multiple",
        "Are you sure you want to discard changes in {0} files?",
        files.length,
    );
}

export function warnUntracked(untracked: number): string {
    return localize(
        "warn untracked",
        "This will DELETE {0} untracked files!\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST.",
        untracked,
    );
}

export function warnUntracked2(untrackedFiles: readonly Resource[]): string {
    if (untrackedFiles.length === 1) {
        return localize(
            "there are untracked files single",
            "The following untracked file will be DELETED FROM DISK if discarded: {0}.",
            path.basename(untrackedFiles[0].state.resourceUri.fsPath),
        );
    }

    return localize(
        "there are untracked files",
        "There are {0} untracked files which will be DELETED FROM DISK if discarded.",
        untrackedFiles.length,
    );
}

export function confirmDiscard2(message: string, untrackedFiles: readonly Resource[]): string {
    return localize(
        "confirm discard all 2",
        "{0}\n\nThis is IRREVERSIBLE, your current working set will be FOREVER LOST.",
        message,
        untrackedFiles.length,
    );
}

export function confirmDiscardTracked(trackedFiles: readonly Resource[]): string {
    if (trackedFiles.length === 1) {
        return localize("yes discard tracked", "Discard 1 Tracked File");
    }

    return localize("yes discard tracked multiple", "Discard {0} Tracked Files", trackedFiles.length);
}

export function discardAll(files: readonly Resource[]): string {
    return localize("discardAll", "Discard All {0} Files", files.length);
}

export function commitHash(): string {
    return localize("commit hash", "Commit Hash");
}

export function provideCommitHash(): string {
    return localize("provide commit hash", "Please provide the commit hash");
}

export function tagAt(shortCommit: string): string {
    return localize("tag at", "Tag at {0}", shortCommit);
}

export function remoteBranchAt(shortCommit: string): string {
    return localize("remote branch at", "Remote branch at {0}", shortCommit);
}

export function checkoutDetached(): string {
    return localize("checkout detached", "Checkout detached...");
}

export function selectRefToCheckout(): string {
    return localize("select a ref to checkout", "Select a ref to checkout");
}

export function selectRefToCheckoutDetached(): string {
    return localize("select a ref to checkout detached", "Select a ref to checkout in detached mode");
}

export function forceCheckout(): string {
    return localize("force", "Force Checkout");
}

export function stashAndCheckout(): string {
    return localize("stashcheckout", "Stash & Checkout");
}

export function localChanges(): string {
    return localize("local changes", "Your local changes would be overwritten by checkout.");
}

export function invalidBranchName(): string {
    return localize("invalid branch name", "Invalid branch name");
}

export function branchAlreadyExists(branchName: string): string {
    return localize("branch already exists", "A branch named '{0}' already exists", branchName);
}

export function createBranch(): string {
    return localize("create branch", "Create new branch...");
}

export function createBranchFrom(): string {
    return localize("create branch from", "Create new branch from...");
}

export function provideBranchName(): string {
    return localize("provide branch name", "Please provide a new branch name");
}

export function branchNameFormatInvalid(branchValidationRegex: string): string {
    return localize(
        "branch name format invalid",
        "Branch name needs to match regex: {0}",
        branchValidationRegex,
    );
}

export function selectRefToBranchFrom(branchName: string): string {
    return localize(
        "select a ref to create a new branch from",
        "Select a ref to create the '{0}' branch from",
        branchName,
    );
}
