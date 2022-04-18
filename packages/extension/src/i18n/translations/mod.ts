import * as nls from "vscode-nls";

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

export function pullPushN(commitsBehind: number, commitsAhead: number, upstreamRemote: string, upstreamName: string): string {
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

export function commitMessage(branchName?: string): string {
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
