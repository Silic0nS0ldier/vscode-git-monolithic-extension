import {
    type ConfigurationChangeEvent,
    type ConfigurationScope,
    type ConfigurationTarget,
    extensions,
    workspace,
    type WorkspaceConfiguration,
} from "vscode";

// TODO Consolidate SSOT for config

export function builtinGitEnabled(): boolean {
    const builtinGitExtension = extensions.getExtension("vscode.git");
    if (!builtinGitExtension) {
        return false;
    }
    return workspace.getConfiguration("git").get<boolean>("enabled", true);
}
builtinGitEnabled.affected = function (e: ConfigurationChangeEvent, scope?: ConfigurationScope): boolean {
    return e.affectsConfiguration("git.enabled", scope);
}

function getExtensionConfig(scope?: ConfigurationScope): WorkspaceConfiguration {
    return workspace.getConfiguration("git_monolithic", scope ?? null);
}

type ConfigOption<T> = {
    (scope?: ConfigurationScope): T;
    affected: (e: ConfigurationChangeEvent, scope?: ConfigurationScope) => boolean;
    update: ((value: T, configurationTarget?: boolean | ConfigurationTarget, scope?: ConfigurationScope) => Thenable<void>);
};

function createConfigOption<T>(section: string, defaultValue: T): ConfigOption<T> {
    const getter = (scope?: ConfigurationScope): T => {
        return getExtensionConfig(scope).get<T>(section, defaultValue);
    };
    getter.affected = (e: ConfigurationChangeEvent, scope?: ConfigurationScope): boolean => {
        return e.affectsConfiguration("git_monolithic." + section, scope);
    };
    getter.update = (value: T, configurationTarget?: boolean | ConfigurationTarget, scope?: ConfigurationScope): Thenable<void> => {
        return getExtensionConfig(scope).update(section, value, configurationTarget);
    };
    return getter;
}

export function affected(e: ConfigurationChangeEvent, scope?: ConfigurationScope): boolean {
    return e.affectsConfiguration("git_monolithic", scope);
}

export const enabled = createConfigOption<boolean>("enabled", true);
export const autoRepositoryDetection = createConfigOption<boolean | "subFolders" | "openEditors">("autoRepositoryDetection", true);
export const scanRepositories = createConfigOption<string[]>("scanRepositories", []);
export const ignoredRepositories = createConfigOption<string[]>("ignoredRepositories", []);
export const enableStatusBarSync = createConfigOption<boolean>("enableStatusBarSync", true);
export const rebaseWhenSync = createConfigOption<string>("rebaseWhenSync", "");
export const terminalAuthentication = createConfigOption<boolean>("terminalAuthentication", true);
export const checkoutType = createConfigOption<string | string[]>("checkoutType", []);
export const branchWhitespaceChar = createConfigOption<string>("branchWhitespaceChar", "");
export const branchValidationRegex = createConfigOption<string>("branchValidationRegex", "");
export const openAfterClone = createConfigOption<"always" | "alwaysNewWindow" | "whenNoFolderOpen" | "prompt">("openAfterClone", "prompt");
export const defaultCloneDirectory = createConfigOption<string>("defaultCloneDirectory", "~/");
export const promptToSaveFilesBeforeCommit = createConfigOption<"always" | "staged" | "never">("promptToSaveFilesBeforeCommit", "always");
export const enableSmartCommit = createConfigOption<boolean>("enableSmartCommit", false);
export const enableCommitSigning = createConfigOption<boolean>("enableCommitSigning", false);
export const suggestSmartCommit = createConfigOption<boolean>("suggestSmartCommit", false);
export const alwaysSignOff = createConfigOption<boolean>("alwaysSignOff", false);
export const smartCommitChanges = createConfigOption<"all" | "tracked">("smartCommitChanges", "all");
export const allowNoVerifyCommit = createConfigOption<boolean>("allowNoVerifyCommit", false);
export const confirmNoVerifyCommit = createConfigOption<boolean>("confirmNoVerifyCommit", true);

/**
 * @deprecated Functionality was removed, this was leftover
 */
export const untrackedChanges = createConfigOption<"mixed" | "separate" | "hidden">("untrackedChanges", "separate");
export const postCommitCommand = createConfigOption<"none" | "push" | "sync">("postCommitCommand", "none");
export const confirmEmptyCommits = createConfigOption<boolean>("confirmEmptyCommits", true);
export const allowForcePush = createConfigOption<boolean>("allowForcePush", false);
export const useForcePushWithLease = createConfigOption<boolean>("useForcePushWithLease", true);
export const promptToSaveFilesBeforeStash = createConfigOption<"always" | "staged" | "never">("promptToSaveFilesBeforeStash", "always");
export const useCommitInputAsStashMessage = createConfigOption<boolean>("useCommitInputAsStashMessage", false);
export const confirmSync = createConfigOption<boolean>("confirmSync", false);
export const ignoreMissingGitWarning = createConfigOption<boolean>("ignoreMissingGitWarning", false);
export const ignoreWindowsGit27Warning = createConfigOption<boolean>("ignoreWindowsGit27Warning", false);
export const ignoreLegacyWarning = createConfigOption<boolean>("ignoreLegacyWarning", false);
export const showProgress = createConfigOption<boolean>("showProgress", true);
export const openDiffOnClick = createConfigOption<boolean>("openDiffOnClick", true);
export const ignoreRebaseWarning = createConfigOption<boolean>("ignoreRebaseWarning", false);
export const requireGitUserConfig = createConfigOption<boolean>("requireGitUserConfig", true);
export const pruneOnFetch = createConfigOption<boolean>("pruneOnFetch", false);
export const autoStash = createConfigOption<boolean>("autoStash", false);
export const countBadge = createConfigOption<"all" | "tracked" | "off">("countBadge", "all");
export const autoRefresh = createConfigOption<boolean>("autorefresh", true);
export const showCommitInput = createConfigOption<boolean>("showCommitInput", true);
export const fetchOnPull = createConfigOption<boolean>("fetchOnPull", false);
export const pullTags = createConfigOption<boolean>("pullTags", true);
export const followTagsWhenSync = createConfigOption<boolean>("followTagsWhenSync", false);
export const supportCancellation = createConfigOption<boolean>("supportCancellation", false);
export const decorationsEnabled = createConfigOption<boolean>("decorations.enabled", true);
export const branchSortOrder = createConfigOption<"alphabetically" | "committerdate">("branchSortOrder", "committerdate");
export const ignoreSubmodules = createConfigOption<boolean>("ignoreSubmodules", false);
export const autoFetch = createConfigOption<boolean | "all">("autofetch", false);
export const autoFetchPeriod = createConfigOption<number>("autofetchPeriod", 3 /** minutes */ * 60);
export const path = createConfigOption<string | string[] | null>("path", null);
export const showPushSuccessNotification = createConfigOption<boolean>("showPushSuccessNotification", false);
export const detectSubmodules = createConfigOption<boolean>("detectSubmodules", true);
export const detectSubmodulesLimit = createConfigOption<number>("detectSubmodulesLimit", 10);
export const confirmForcePush = createConfigOption<boolean>("confirmForcePush", true);
