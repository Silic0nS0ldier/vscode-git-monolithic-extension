import * as nls from "vscode-nls";

// TODO Inline this, see https://github.com/microsoft/vscode-nls/blob/main/src/common/common.ts#L100
const localize = nls.loadMessageBundle();

export function missOrInvalid() {
    return localize("missOrInvalid", "Missing or invalid credentials.");
}

export function yes() {
    return localize("yes", "Yes");
}

export function no() {
    return localize("no", "No");
}

export function askLater() {
    return localize("not now", "Ask Me Later");
}

export function suggestAutoFetch() {
    return localize(
        "suggest auto fetch",
        "Would you like Code to [periodically run 'git fetch']({0})?",
        // TODO Documentation should be served from extension
        "https://go.microsoft.com/fwlink/?linkid=865294",
    );
}

export function openGitLog() {
    return localize("open git log", "Open Git Log");
}

export function showCommandOutput() {
    return localize("show command output", "Show Command Output");
}

export function cleanRepo() {
    return localize("clean repo", "Please clean your repository working tree before checkout.");
}

export function cantPush() {
    return localize(
        "cant push",
        "Can't push refs to remote. Try running 'Pull' first to integrate your changes.",
    );
}

export function mergeConflicts() {
    return localize("merge conflicts", "There are merge conflicts. Resolve them before committing.");
}

export function stashMergeConflicts() {
    return localize("stash merge conflicts", "There were merge conflicts while applying the stash.");
}

export function authFailed(reason?: string) {
    if (reason) {
        return localize("auth failed specific", "Failed to authenticate to git remote:\n\n{0}", reason);
    }

    return localize("auth failed", "Failed to authenticate to git remote.");
}

export function missingUserInfo() {
    return localize(
        "missing user info",
        "Make sure you configure your 'user.name' and 'user.email' in git.",
    );
}

export function learnMore() {
    return localize("learn more", "Learn More");
}

export function gitError(hint?: string) {
    if (hint) {
        return localize("git error details", "Git: {0}", hint);
    }

    return localize("git error", "Git error");
}

export function fallthroughError() {
    return localize("fallthrough error", "An unexpected error occurred.");
}

export function selectBranchToDelete() {
    return localize("select branch to delete", "Select a branch to delete");
}

export function confirmForceDeleteBranch(branchName: string) {
    return localize(
        "confirm force delete branch",
        "The branch '{0}' is not fully merged. Delete anyway?",
        branchName,
    );
}

export function deleteBranch() {
    return localize("delete branch", "Delete Branch");
}

export function commit() {
    return localize("commit", "Commit");
}

export function mergeChanges() {
    return localize("merge changes", "Merge");
}

export function stagedChanges() {
    return localize("staged changes", "Staged");
}

export function trackedChanges() {
    return localize("tracked changes", "Tracked");
}

export function untrackedChanges() {
    return localize("untracked changes", "Untracked");
}

export function rebasing() {
    return localize("rebasing", "Rebasing");
}

export function checkout() {
    return localize("checkout", "Checkout branch/tag...");
}

export function publishTo(remoteName?: string) {
    if (remoteName) {
        return localize("publish to", "Publish to {0}", remoteName);
    }

    return localize("publish to...", "Publish to...");
}

export function publishChanges() {
    return localize("publish changes", "Publish Changes");
}

export function syncingChanges() {
    return localize("syncing changes", "Synchronizing Changes...");
}

export function gitTitleIndex(fileName: string) {
    return localize("git.title.index", "{0} (Index)", fileName);
}

export function gitTitleWorkingTree(filename: string) {
    return localize("git.title.workingTree", "{0} (Working Tree)", filename);
}

export function gitTitleDeleted(fileName: string) {
    return localize("git.title.deleted", "{0} (Deleted)", fileName);
}

export function gitTitleTheirs(fileName: string) {
    return localize("git.title.theirs", "{0} (Theirs)", fileName);
}

export function gitTitleOurs(fileName: string) {
    return localize("git.title.ours", "{0} (Ours)", fileName);
}

export function gitTitleUntracked(fileName: string) {
    return localize("git.title.untracked", "{0} (Untracked)", fileName);
}

export function open() {
    return localize("open", "Open");
}

export function tooManyChanges(repoRoot: string) {
    return localize(
        "huge",
        "The git repository at '{0}' has too many active changes, only a subset of Git features will be enabled.",
        repoRoot,
    );
}

export function neverAgain() {
    return localize("neveragain", "Don't Show Again");
}

export function addKnown(folderName: string) {
    return localize("add known", "Would you like to add '{0}' to .gitignore?", folderName);
}

export function syncChanges() {
    return localize("sync changes", "Synchronize Changes");
}

export function pullN(commitsBehind: number, upstreamRemote: string, upstreamName: string) {
    return localize(
        "pull n",
        "Pull {0} commits from {1}/{2}",
        commitsBehind,
        upstreamRemote,
        upstreamName,
    );
}

export function pushN(commitsAhead: number, upstreamRemote: string, upstreamName: string) {
    return localize(
        "push n",
        "Push {0} commits to {1}/{2}",
        commitsAhead,
        upstreamRemote,
        upstreamName,
    );
}

export function pullPushN(commitsBehind: number, commitsAhead: number, upstreamRemote: string, upstreamName: string) {
    return localize(
        "pull push n",
        "Pull {0} and push {1} commits between {2}/{3}",
        commitsBehind,
        commitsAhead,
        upstreamRemote,
        upstreamName,
    );
}

export function syncIsUnpredictable() {
    return localize(
        "sync is unpredictable",
        "Syncing. Cancelling may cause serious damages to the repository",
    );
}

export function commitMessage(branchName?: string) {
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

export function pushSuccess() {
    return localize("push success", "Successfully pushed.");
}

export function alwaysPull() {
    return localize("always pull", "Always Pull");
}

export function pull() {
    return localize("pull", "Pull");
}

export function dontPull() {
    return localize("dont pull", "Don't Pull");
}

export function pullMaybeRebased(branchName?: string) {
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

export function indexModified() {
    return localize("index modified", "Index Modified");
}

export function modified() {
    return localize("modified", "Modified");
}

export function indexAdded() {
    return localize("index added", "Index Added");
}

export function indexDeleted() {
    return localize("index deleted", "Index Deleted");
}

export function deleted() {
    return localize("deleted", "Deleted");
}

export function indexRenamed() {
    return localize("index renamed", "Index Renamed");
}

export function indexCopied() {
    return localize("index copied", "Index Copied");
}

export function untracked() {
    return localize("untracked", "Untracked");
}

export function ignored() {
    return localize("ignored", "Ignored");
}

export function intentToAdd() {
    return localize("intent to add", "Intent to Add");
}

export function bothDeleted() {
    return localize("both deleted", "Conflict: Both Deleted");
}

export function addedByUs() {
    return localize("added by us", "Conflict: Added By Us");
}

export function deletedByThem() {
    return localize("deleted by them", "Conflict: Deleted By Them");
}

export function addedByThem() {
    return localize("added by them", "Conflict: Added By Them");
}

export function deletedByUs() {
    return localize("deleted by us", "Conflict: Deleted By Us");
}

export function bothAdded() {
    return localize("both added", "Conflict: Both Added");
}

export function bothModified() {
    return localize("both modified", "Conflict: Both Modified");
}

export function typeToSearch() {
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
