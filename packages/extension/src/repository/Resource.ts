import onetime from "onetime";
import {
    Command,
    commands,
    FileDecoration,
    SourceControlResourceDecorations,
    SourceControlResourceState,
    ThemeColor,
    Uri,
} from "vscode";
import { Status, StatusOptions } from "../api/git.js";
import type { Submodule } from "../git/Submodule.js";
import * as i18n from "../i18n/mod.js";
import { getResources, resolveChangeCommand, resolveDefaultCommand } from "../repository/resource-command-resolver.js";
import type { SourceControlUIGroup } from "../ui/source-control.js";
import { getIconUri } from "./getIconUri.js";
import type { ResourceGroupTypeOptions } from "./ResourceGroupType.js";

export function createResource(
    repoRoot: string,
    submodules: Submodule[],
    sourceControlUI: SourceControlUIGroup,
    resourceGroupType: ResourceGroupTypeOptions,
    resourceUri: Uri,
    type: StatusOptions,
    useIcons: boolean,
    renameResourceUri?: Uri,
) {
    const normalisedResourceUri = onetime(() => {
        if (
            renameResourceUri
            && (type === Status.MODIFIED || type === Status.DELETED || type === Status.INDEX_RENAMED
                || type === Status.INDEX_COPIED)
        ) {
            return renameResourceUri;
        }

        return resourceUri;
    });

    return new Resource(
        normalisedResourceUri,
        repoRoot,
        submodules,
        sourceControlUI,
        resourceGroupType,
        type,
        useIcons,
        renameResourceUri,
    );
}

function getStatusText(type: StatusOptions): string {
    switch (type) {
        case Status.INDEX_MODIFIED:
            return i18n.Translations.indexModified();
        case Status.MODIFIED:
            return i18n.Translations.modified();
        case Status.INDEX_ADDED:
            return i18n.Translations.indexAdded();
        case Status.INDEX_DELETED:
            return i18n.Translations.indexDeleted();
        case Status.DELETED:
            return i18n.Translations.deleted();
        case Status.INDEX_RENAMED:
            return i18n.Translations.indexRenamed();
        case Status.INDEX_COPIED:
            return i18n.Translations.indexCopied();
        case Status.UNTRACKED:
            return i18n.Translations.untracked();
        case Status.IGNORED:
            return i18n.Translations.ignored();
        case Status.INTENT_TO_ADD:
            return i18n.Translations.intentToAdd();
        case Status.BOTH_DELETED:
            return i18n.Translations.bothDeleted();
        case Status.ADDED_BY_US:
            return i18n.Translations.addedByUs();
        case Status.DELETED_BY_THEM:
            return i18n.Translations.deletedByThem();
        case Status.ADDED_BY_THEM:
            return i18n.Translations.addedByThem();
        case Status.DELETED_BY_US:
            return i18n.Translations.deletedByUs();
        case Status.BOTH_ADDED:
            return i18n.Translations.bothAdded();
        case Status.BOTH_MODIFIED:
            return i18n.Translations.bothModified();
        default:
            return "";
    }
}

const Icons = {
    dark: {
        Added: getIconUri("status-added", "dark"),
        Conflict: getIconUri("status-conflict", "dark"),
        Copied: getIconUri("status-copied", "dark"),
        Deleted: getIconUri("status-deleted", "dark"),
        Ignored: getIconUri("status-ignored", "dark"),
        Modified: getIconUri("status-modified", "dark"),
        Renamed: getIconUri("status-renamed", "dark"),
        Untracked: getIconUri("status-untracked", "dark"),
    },
    light: {
        Added: getIconUri("status-added", "light"),
        Conflict: getIconUri("status-conflict", "light"),
        Copied: getIconUri("status-copied", "light"),
        Deleted: getIconUri("status-deleted", "light"),
        Ignored: getIconUri("status-ignored", "light"),
        Modified: getIconUri("status-modified", "light"),
        Renamed: getIconUri("status-renamed", "light"),
        Untracked: getIconUri("status-untracked", "light"),
    },
};

function getIconPath(type: StatusOptions, theme: string): Uri {
    if (theme !== "light" && theme !== "dark") {
        throw new Error(`Unknown theme ${theme}`);
    }
    switch (type) {
        case Status.INDEX_MODIFIED:
            return Icons[theme].Modified;
        case Status.MODIFIED:
            return Icons[theme].Modified;
        case Status.INDEX_ADDED:
            return Icons[theme].Added;
        case Status.INDEX_DELETED:
            return Icons[theme].Deleted;
        case Status.DELETED:
            return Icons[theme].Deleted;
        case Status.INDEX_RENAMED:
            return Icons[theme].Renamed;
        case Status.INDEX_COPIED:
            return Icons[theme].Copied;
        case Status.UNTRACKED:
            return Icons[theme].Untracked;
        case Status.IGNORED:
            return Icons[theme].Ignored;
        case Status.INTENT_TO_ADD:
            return Icons[theme].Added;
        case Status.BOTH_DELETED:
            return Icons[theme].Conflict;
        case Status.ADDED_BY_US:
            return Icons[theme].Conflict;
        case Status.DELETED_BY_THEM:
            return Icons[theme].Conflict;
        case Status.ADDED_BY_THEM:
            return Icons[theme].Conflict;
        case Status.DELETED_BY_US:
            return Icons[theme].Conflict;
        case Status.BOTH_ADDED:
            return Icons[theme].Conflict;
        case Status.BOTH_MODIFIED:
            return Icons[theme].Conflict;
        default:
            // TODO This can be guarded at compile time
            throw new Error("Unknown git status: " + type);
    }
}

function getStateLetter(type: StatusOptions): string {
    switch (type) {
        case Status.INDEX_MODIFIED:
        case Status.MODIFIED:
            return "M";
        case Status.INDEX_ADDED:
        case Status.INTENT_TO_ADD:
            return "A";
        case Status.INDEX_DELETED:
        case Status.DELETED:
            return "D";
        case Status.INDEX_RENAMED:
            return "R";
        case Status.UNTRACKED:
            return "U";
        case Status.IGNORED:
            return "I";
        case Status.DELETED_BY_THEM:
            return "D";
        case Status.DELETED_BY_US:
            return "D";
        case Status.INDEX_COPIED:
            return "C";
        case Status.BOTH_DELETED:
        case Status.ADDED_BY_US:
        case Status.ADDED_BY_THEM:
        case Status.BOTH_ADDED:
        case Status.BOTH_MODIFIED:
            return "!"; // Using ! instead of ⚠, because the latter looks really bad on windows
        default:
            throw new Error("Unknown git status: " + type);
    }
}

function getStateColor(type: StatusOptions) {
    switch (type) {
        case Status.INDEX_MODIFIED:
            return new ThemeColor("gitDecoration.stageModifiedResourceForeground");
        case Status.MODIFIED:
            return new ThemeColor("gitDecoration.modifiedResourceForeground");
        case Status.INDEX_DELETED:
            return new ThemeColor("gitDecoration.stageDeletedResourceForeground");
        case Status.DELETED:
            return new ThemeColor("gitDecoration.deletedResourceForeground");
        case Status.INDEX_ADDED:
        case Status.INTENT_TO_ADD:
            return new ThemeColor("gitDecoration.addedResourceForeground");
        case Status.INDEX_COPIED:
        case Status.INDEX_RENAMED:
            return new ThemeColor("gitDecoration.renamedResourceForeground");
        case Status.UNTRACKED:
            return new ThemeColor("gitDecoration.untrackedResourceForeground");
        case Status.IGNORED:
            return new ThemeColor("gitDecoration.ignoredResourceForeground");
        case Status.BOTH_DELETED:
        case Status.ADDED_BY_US:
        case Status.DELETED_BY_THEM:
        case Status.ADDED_BY_THEM:
        case Status.DELETED_BY_US:
        case Status.BOTH_ADDED:
        case Status.BOTH_MODIFIED:
            return new ThemeColor("gitDecoration.conflictingResourceForeground");
        default:
            throw new Error("Unknown git status: " + type);
    }
}

function getStateStrikethrough(type: StatusOptions) {
    switch (type) {
        case Status.DELETED:
        case Status.BOTH_DELETED:
        case Status.DELETED_BY_THEM:
        case Status.DELETED_BY_US:
        case Status.INDEX_DELETED:
            return true;
        default:
            return false;
    }
}

export type ResourceState = {
    readonly leftUri: Uri | undefined;
    readonly rightUri: Uri | undefined;
    readonly resourceUri: Uri;
    readonly resourceGroupType: ResourceGroupTypeOptions;
    readonly type: StatusOptions;
    readonly original: Uri;
    readonly renameResourceUri: Uri | undefined;
    readonly resourceDecoration: FileDecoration;
    open(): Promise<void>;
    openChange(): Promise<void>;
};

export class Resource implements SourceControlResourceState {
    /**
     * State which can be referenced by this plugin. All other properties are considered "owned" by VSCode.
     * This will eventually be split off completely from UI state.
     * @todo Separate state management from UI.
     */
    readonly state: ResourceState;

    get resourceUri(): Uri {
        return this.#normalisedResourceUri();
    }

    get command(): Command {
        return resolveDefaultCommand(this, this.#repoRoot);
    }

    get decorations(): SourceControlResourceDecorations {
        const light = this.#useIcons ? { iconPath: getIconPath(this.#type, "light") } : undefined;
        const dark = this.#useIcons ? { iconPath: getIconPath(this.#type, "dark") } : undefined;
        const tooltip = getStatusText(this.#type);
        const strikeThrough = getStateStrikethrough(this.#type);
        const faded = false;
        return { dark, faded, light, strikeThrough, tooltip };
    }

    #normalisedResourceUri: () => Uri;
    #repoRoot: string;
    #type: StatusOptions;
    #useIcons: boolean;

    constructor(
        normalisedResourceUri: () => Uri,
        repoRoot: string,
        submodules: Submodule[],
        sourceControlUI: SourceControlUIGroup,
        resourceGroupType: ResourceGroupTypeOptions,
        type: StatusOptions,
        useIcons: boolean,
        renameResourceUri_?: Uri,
    ) {
        this.#normalisedResourceUri = normalisedResourceUri;
        this.#repoRoot = repoRoot;
        this.#type = type;
        this.#useIcons = useIcons;
        const self = this;
        const resources = onetime((): [Uri | undefined, Uri | undefined] =>
            getResources(self.state, self.#repoRoot, submodules, sourceControlUI.stagedGroup)
        );
        this.state = {
            get leftUri(): Uri | undefined {
                return resources()[0];
            },
            async open() {
                const command = self.command;
                await commands.executeCommand<void>(command.command, ...(command.arguments || []));
            },
            async openChange() {
                const command = resolveChangeCommand(self);
                await commands.executeCommand<void>(command.command, ...(command.arguments || []));
            },
            get original() {
                return self.resourceUri;
            },
            get renameResourceUri() {
                return renameResourceUri_;
            },
            get resourceDecoration() {
                const res = new FileDecoration(
                    getStateLetter(self.#type),
                    getStatusText(self.#type),
                    getStateColor(self.#type),
                );
                res.propagate = self.#type !== Status.DELETED && self.#type !== Status.INDEX_DELETED;
                return res;
            },
            get resourceGroupType() {
                return resourceGroupType;
            },
            get resourceUri() {
                return self.resourceUri;
            },
            get rightUri() {
                return resources()[1];
            },
            get type() {
                return self.#type;
            },
        };
    }
}
