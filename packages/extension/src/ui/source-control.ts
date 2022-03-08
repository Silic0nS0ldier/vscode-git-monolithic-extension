import { Command, Disposable, scm, SourceControlInputBox, Uri } from "vscode";
import { Resource } from "../repository/Resource.js";
import { localize } from "../util.js";

/**
 * An encapsulatin of the source control panel.
 * Eventually this will decouple UI state from application logic. For now it helps make existing
 * API usage easier to track.
 */
export function create(repoRoot: string): SourceControlUIGroup & Disposable {
    const rootUri = Uri.file(repoRoot);
    const sourceControl = scm.createSourceControl("git", "Git", rootUri);
    const mergeGroup = sourceControl.createResourceGroup(
        "merge",
        localize("merge changes", "Merge Changes"),
    );
    const indexGroup = sourceControl.createResourceGroup(
        "index",
        localize("staged changes", "Staged Changes"),
    );
    const workingTreeGroup = sourceControl.createResourceGroup(
        "workingTree",
        localize("changes", "Changes"),
    );
    const untrackedGroup = sourceControl.createResourceGroup(
        "untracked",
        localize("untracked changes", "Untracked Changes"),
    );

    mergeGroup.hideWhenEmpty = true;

    return {
        dispose() {
            indexGroup.dispose();
            mergeGroup.dispose();
            untrackedGroup.dispose();
            workingTreeGroup.dispose();
            // Must go last
            sourceControl.dispose();
        },
        indexGroup: indexGroup  as unknown as SourceControlResourceGroupUI,
        mergeGroup: mergeGroup as unknown as SourceControlResourceGroupUI,
        sourceControl: sourceControl as unknown as SourceControlUI,
        untrackedGroup: untrackedGroup as unknown as SourceControlResourceGroupUI,
        workingTreeGroup: workingTreeGroup as unknown as SourceControlResourceGroupUI,
    };
}

export type SourceControlUIGroup = {
    readonly sourceControl: SourceControlUI;
    readonly mergeGroup: SourceControlResourceGroupUI;
    readonly indexGroup: SourceControlResourceGroupUI;
    // TODO Rename to changes, as this won't be the only one
    readonly workingTreeGroup: SourceControlResourceGroupUI;
    readonly untrackedGroup: SourceControlResourceGroupUI;
}

type SourceControlUI = {
    inputBox: SourceControlInputBox;
    count: number;
    acceptInputCommand: {};
    quickDiffProvider: unknown;
    statusBarCommands: Command[];
    commitTemplate?: string;
};

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    resourceStates: Resource[];
};
