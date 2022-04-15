import * as nls from "vscode-nls";

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
