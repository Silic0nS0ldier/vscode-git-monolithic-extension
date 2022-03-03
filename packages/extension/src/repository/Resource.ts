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
import { Status } from "../api/git.js";
import { Submodule } from "../git.js";
import {
    getResources,
    resolveChangeCommand,
    resolveDefaultCommand,
    resolveFileCommand,
} from "../repository/resource-command-resolver.js";
import { localize } from "../util.js";
import { getIconUri } from "./getIconUri.js";
import { GitResourceGroup } from "./GitResourceGroup.js";
import { ResourceGroupType } from "./ResourceGroupType.js";

export class Resource implements SourceControlResourceState {
    static getStatusText(type: Status) {
        switch (type) {
            case Status.INDEX_MODIFIED:
                return localize("index modified", "Index Modified");
            case Status.MODIFIED:
                return localize("modified", "Modified");
            case Status.INDEX_ADDED:
                return localize("index added", "Index Added");
            case Status.INDEX_DELETED:
                return localize("index deleted", "Index Deleted");
            case Status.DELETED:
                return localize("deleted", "Deleted");
            case Status.INDEX_RENAMED:
                return localize("index renamed", "Index Renamed");
            case Status.INDEX_COPIED:
                return localize("index copied", "Index Copied");
            case Status.UNTRACKED:
                return localize("untracked", "Untracked");
            case Status.IGNORED:
                return localize("ignored", "Ignored");
            case Status.INTENT_TO_ADD:
                return localize("intent to add", "Intent to Add");
            case Status.BOTH_DELETED:
                return localize("both deleted", "Conflict: Both Deleted");
            case Status.ADDED_BY_US:
                return localize("added by us", "Conflict: Added By Us");
            case Status.DELETED_BY_THEM:
                return localize("deleted by them", "Conflict: Deleted By Them");
            case Status.ADDED_BY_THEM:
                return localize("added by them", "Conflict: Added By Them");
            case Status.DELETED_BY_US:
                return localize("deleted by us", "Conflict: Deleted By Us");
            case Status.BOTH_ADDED:
                return localize("both added", "Conflict: Both Added");
            case Status.BOTH_MODIFIED:
                return localize("both modified", "Conflict: Both Modified");
            default:
                return "";
        }
    }

    get resourceUri(): Uri {
        return this.___resourceUri();
    }

    private ___resourceUri = onetime(() => {
        if (
            this.renameResourceUri
            && (this._type === Status.MODIFIED || this._type === Status.DELETED || this._type === Status.INDEX_RENAMED
                || this._type === Status.INDEX_COPIED)
        ) {
            return this.renameResourceUri;
        }

        return this._resourceUri;
    });

    get leftUri(): Uri | undefined {
        return this._resources()[0];
    }

    get rightUri(): Uri | undefined {
        return this._resources()[1];
    }

    get command(): Command {
        return resolveDefaultCommand(this, this.repoRoot);
    }

    private _resources = onetime((): [Uri | undefined, Uri | undefined] =>
        getResources(this, this.repoRoot, this.submodules, this.indexGroup)
    );

    get resourceGroupType(): ResourceGroupType {
        return this._resourceGroupType;
    }
    get type(): Status {
        return this._type;
    }
    get original(): Uri {
        return this._resourceUri;
    }
    get renameResourceUri(): Uri | undefined {
        return this._renameResourceUri;
    }

    private static Icons = {
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
    } as const;

    private getIconPath(theme: string): Uri {
        if (theme !== "light" && theme !== "dark") {
            throw new Error(`Unknown theme ${theme}`);
        }
        switch (this.type) {
            case Status.INDEX_MODIFIED:
                return Resource.Icons[theme].Modified;
            case Status.MODIFIED:
                return Resource.Icons[theme].Modified;
            case Status.INDEX_ADDED:
                return Resource.Icons[theme].Added;
            case Status.INDEX_DELETED:
                return Resource.Icons[theme].Deleted;
            case Status.DELETED:
                return Resource.Icons[theme].Deleted;
            case Status.INDEX_RENAMED:
                return Resource.Icons[theme].Renamed;
            case Status.INDEX_COPIED:
                return Resource.Icons[theme].Copied;
            case Status.UNTRACKED:
                return Resource.Icons[theme].Untracked;
            case Status.IGNORED:
                return Resource.Icons[theme].Ignored;
            case Status.INTENT_TO_ADD:
                return Resource.Icons[theme].Added;
            case Status.BOTH_DELETED:
                return Resource.Icons[theme].Conflict;
            case Status.ADDED_BY_US:
                return Resource.Icons[theme].Conflict;
            case Status.DELETED_BY_THEM:
                return Resource.Icons[theme].Conflict;
            case Status.ADDED_BY_THEM:
                return Resource.Icons[theme].Conflict;
            case Status.DELETED_BY_US:
                return Resource.Icons[theme].Conflict;
            case Status.BOTH_ADDED:
                return Resource.Icons[theme].Conflict;
            case Status.BOTH_MODIFIED:
                return Resource.Icons[theme].Conflict;
            default:
                throw new Error("Unknown git status: " + this.type);
        }
    }

    private get tooltip(): string {
        return Resource.getStatusText(this.type);
    }

    private get strikeThrough(): boolean {
        switch (this.type) {
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

    private _faded = onetime(() => {
        // TODO@joao
        return false;
        // const workspaceRootPath = this.workspaceRoot.fsPath;
        // return this.resourceUri.fsPath.substr(0, workspaceRootPath.length) !== workspaceRootPath;
    });

    get decorations(): SourceControlResourceDecorations {
        const light = this._useIcons ? { iconPath: this.getIconPath("light") } : undefined;
        const dark = this._useIcons ? { iconPath: this.getIconPath("dark") } : undefined;
        const tooltip = this.tooltip;
        const strikeThrough = this.strikeThrough;
        const faded = this._faded();
        return { strikeThrough, faded, tooltip, light, dark };
    }

    get letter(): string {
        switch (this.type) {
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
                throw new Error("Unknown git status: " + this.type);
        }
    }

    get color(): ThemeColor {
        switch (this.type) {
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
                throw new Error("Unknown git status: " + this.type);
        }
    }

    get priority(): number {
        switch (this.type) {
            case Status.INDEX_MODIFIED:
            case Status.MODIFIED:
            case Status.INDEX_COPIED:
                return 2;
            case Status.IGNORED:
                return 3;
            case Status.BOTH_DELETED:
            case Status.ADDED_BY_US:
            case Status.DELETED_BY_THEM:
            case Status.ADDED_BY_THEM:
            case Status.DELETED_BY_US:
            case Status.BOTH_ADDED:
            case Status.BOTH_MODIFIED:
                return 4;
            default:
                return 1;
        }
    }

    get resourceDecoration(): FileDecoration {
        const res = new FileDecoration(this.letter, this.tooltip, this.color);
        res.propagate = this.type !== Status.DELETED && this.type !== Status.INDEX_DELETED;
        return res;
    }

    constructor(
        private repoRoot: string,
        private submodules: Submodule[],
        private indexGroup: GitResourceGroup,
        private _resourceGroupType: ResourceGroupType,
        private _resourceUri: Uri,
        private _type: Status,
        private _useIcons: boolean,
        private _renameResourceUri?: Uri,
    ) {}

    async open(): Promise<void> {
        const command = this.command;
        await commands.executeCommand<void>(command.command, ...(command.arguments || []));
    }

    async openFile(): Promise<void> {
        const command = resolveFileCommand(this);
        await commands.executeCommand<void>(command.command, ...(command.arguments || []));
    }

    async openChange(): Promise<void> {
        const command = resolveChangeCommand(this);
        await commands.executeCommand<void>(command.command, ...(command.arguments || []));
    }
}
