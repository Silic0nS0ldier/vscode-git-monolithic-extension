import { type ConfigurationChangeEvent, type ConfigurationScope, workspace, type WorkspaceConfiguration } from "vscode";

// TODO Consolidate SSOT for config

function getExtensionConfig(scope?: ConfigurationScope): WorkspaceConfiguration {
    return workspace.getConfiguration("git-monolithic", scope ?? null);
}

function makeAffectedCheck(section: string): (e: ConfigurationChangeEvent, scope?: ConfigurationScope) => boolean {
    return function affected(e, scope?: ConfigurationScope) {
        return e.affectsConfiguration(section, scope);
    };
}

/**
 * @deprecated
 */
export function legacy(scope?: ConfigurationScope): WorkspaceConfiguration {
    return getExtensionConfig(scope);
}

export function enabled(scope?: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("enabled", true);
}

export function autoRepositoryDetection(): boolean | "subFolders" | "openEditors" {
    return getExtensionConfig().get<boolean | "subFolders" | "openEditors">("autoRepositoryDetection", true);
}

export function scanRepositories(scope?: ConfigurationScope): string[] {
    return getExtensionConfig(scope).get<string[]>("scanRepositories", []);
}

export function ignoredRepositories(): string[] {
    return getExtensionConfig().get<string[]>("ignoredRepositories", []);
}

export function enableStatusBarSync(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("enableStatusBarSync", true);
}
enableStatusBarSync.affected = makeAffectedCheck("enableStatusBarSync")

export function rebaseWhenSync(scope: ConfigurationScope): string {
    return getExtensionConfig(scope).get<string>("rebaseWhenSync", "");
}

export function terminalAuthentication(): boolean {
    return getExtensionConfig().get<boolean>("terminalAuthentication", true);
}

export function checkoutType(): string | string[] {
    return getExtensionConfig().get<string | string[]>("checkoutType", []);
}

export function branchWhitespaceChar(): string {
    return getExtensionConfig().get<string>("branchWhitespaceChar", "");
}

export function branchValidationRegex(): string {
    return getExtensionConfig().get<string>("branchValidationRegex", "");
}

export function openAfterClone(): "always" | "alwaysNewWindow" | "whenNoFolderOpen" | "prompt" {
    return getExtensionConfig().get<"always" | "alwaysNewWindow" | "whenNoFolderOpen" | "prompt">(
        "openAfterClone",
        "prompt",
    );
}

export function defaultCloneDirectory(): string {
    return getExtensionConfig().get<string>("defaultCloneDirectory", "~/");
}

export function promptToSaveFilesBeforeCommit(scope: ConfigurationScope): "always" | "staged" | "never" {
    return getExtensionConfig(scope).get<"always" | "staged" | "never">("promptToSaveFilesBeforeCommit", "always");
}

export function enableSmartCommit(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("enableSmartCommit", false);
}

export function enableCommitSigning(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("enableCommitSigning", false);
}

export function suggestSmartCommit(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("suggestSmartCommit", false);
}

export function alwaysSignOff(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("alwaysSignOff", false);
}

export function smartCommitChanges(scope: ConfigurationScope): "all" | "tracked" {
    return getExtensionConfig(scope).get<"all" | "tracked">("smartCommitChanges", "all");
}

export function allowNoVerifyCommit(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("allowNoVerifyCommit", false);
}

export function confirmNoVerifyCommit(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("confirmNoVerifyCommit", true);
}

/**
 * @deprecated Functionality was removed, this was leftover
 */
export function untrackedChanges(scope: ConfigurationScope): "mixed" | "separate" | "hidden" {
    return getExtensionConfig(scope).get<"mixed" | "separate" | "hidden">("untrackedChanges", "separate");
}

export function postCommitCommand(scope: ConfigurationScope): "none" | "push" | "sync" {
    return getExtensionConfig(scope).get<"none" | "push" | "sync">("postCommitCommand", "none");
}

export function confirmEmptyCommits(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("confirmEmptyCommits", true);
}

export function allowForcePush(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("allowForcePush", false);
}

export function useForcePushWithLease(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("useForcePushWithLease", true);
}

export function promptToSaveFilesBeforeStash(scope: ConfigurationScope): "always" | "staged" | "never" {
    return getExtensionConfig(scope).get<"always" | "staged" | "never">("promptToSaveFilesBeforeStash", "always");
}

export function useCommitInputAsStashMessage(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("useCommitInputAsStashMessage", false);
}

export function confirmSync(): boolean {
    return getExtensionConfig().get<boolean>("confirmSync", false);
}

export function ignoreMissingGitWarning(): boolean {
    return getExtensionConfig().get<boolean>("ignoreMissingGitWarning", false);
}

export function ignoreWindowsGit27Warning(): boolean {
    return getExtensionConfig().get<boolean>("ignoreWindowsGit27Warning", false);
}

export function ignoreLegacyWarning(): boolean {
    return getExtensionConfig().get<boolean>("ignoreLegacyWarning", false);
}

export function showProgress(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("showProgress", true);
}

export function openDiffOnClick(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("openDiffOnClick", true);
}
openDiffOnClick.affected = makeAffectedCheck("openDiffOnClick");

export function ignoreRebaseWarning(): boolean {
    return getExtensionConfig().get<boolean>("ignoreRebaseWarning", false);
}

export function requireGitUserConfig(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("requireGitUserConfig", true);
}

export function pruneOnFetch(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("pruneOnFetch", false);
}

export function autoStash(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("autoStash", false);
}

export function countBadge(scope: ConfigurationScope): "all" | "tracked" | "off" {
    return getExtensionConfig(scope).get<"all" | "tracked" | "off">("countBadge", "all");
}
countBadge.affected = makeAffectedCheck("countBadge");

export function autoRefresh(): boolean {
    return getExtensionConfig().get<boolean>("autorefresh", true);
}

export function showCommitInput(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("showCommitInput", true);
}
showCommitInput.affected = makeAffectedCheck("showCommitInput");

export function fetchOnPull(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("fetchOnPull", false);
}

export function pullTags(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("pullTags", true);
}

export function followTagsWhenSync(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("followTagsWhenSync", false);
}

export function supportCancellation(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("supportCancellation", false);
}

export function decorationsEnabled(): boolean {
    return getExtensionConfig().get<boolean>("decorations.enabled", true);
}
decorationsEnabled.affected = makeAffectedCheck("decorations.enabled");

export function branchSortOrder(): "alphabetically" | "committerdate" {
    return getExtensionConfig().get<"alphabetically" | "committerdate">("branchSortOrder", "committerdate");
}
branchSortOrder.affected = makeAffectedCheck("branchSortOrder")

export function ignoreSubmodules(scope: ConfigurationScope): boolean {
    return getExtensionConfig(scope).get<boolean>("ignoreSubmodules", false);
}
ignoreSubmodules.affected = makeAffectedCheck("ignoreSubmodules")

export function autoFetch(scope: ConfigurationScope): boolean | "all" {
    return getExtensionConfig(scope).get<boolean | "all">("autofetch", false);
}
autoFetch.affected = makeAffectedCheck("autofetch");

export function autoFetchPeriod(scope: ConfigurationScope): number {
    return getExtensionConfig(scope).get<number>("autofetchPeriod", 3 /** minutes */ * 60);
}

export function path(): string | string[] | null {
    return getExtensionConfig().get<string | string[] | null>("path", null);
}

export function showPushSuccessNotification(): boolean {
    return getExtensionConfig().get<boolean>("showPushSuccessNotification", false);
}
