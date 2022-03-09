import { Command, Disposable, QuickDiffProvider, scm, SourceControlInputBox, Uri } from "vscode";
import { Resource } from "../repository/Resource.js";
import { localize } from "../util.js";

/**
 * An encapsulatin of the source control panel.
 * Eventually this will decouple UI state from application logic. For now it helps make existing
 * API usage easier to track.
 */
export function create(repoRoot: string, quickDiffProvider: QuickDiffProvider): SourceControlUIGroup & Disposable {
    const rootUri = Uri.file(repoRoot);

    const sourceControl = scm.createSourceControl("git", "Git", rootUri);
    sourceControl.acceptInputCommand = {
        arguments: [sourceControl],
        command: "git.commit",
        title: localize("commit", "Commit"),
    };
    sourceControl.quickDiffProvider = quickDiffProvider;

    const mergeGroup = sourceControl.createResourceGroup(
        "merge",
        localize("merge changes", "Merge"),
    );
    const stagedGroup = sourceControl.createResourceGroup(
        "index",
        localize("staged changes", "Staged"),
    );
    const trackedGroup = sourceControl.createResourceGroup(
        "tracked",
        localize("tracked changes", "Tracked"),
    );
    const untrackedGroup = sourceControl.createResourceGroup(
        "untracked",
        localize("untracked changes", "Untracked"),
    );

    mergeGroup.hideWhenEmpty = true;

    return {
        dispose() {
            stagedGroup.dispose();
            mergeGroup.dispose();
            untrackedGroup.dispose();
            trackedGroup.dispose();
            // Must go last
            sourceControl.dispose();
        },
        mergeGroup: mergeGroup as unknown as SourceControlResourceGroupUI,
        sourceControl: sourceControl as unknown as SourceControlUI,
        stagedGroup: stagedGroup as unknown as SourceControlResourceGroupUI,
        trackedGroup: trackedGroup as unknown as SourceControlResourceGroupUI,
        untrackedGroup: untrackedGroup as unknown as SourceControlResourceGroupUI,
    };
}

export type SourceControlUIGroup = {
    readonly sourceControl: SourceControlUI;
    readonly mergeGroup: SourceControlResourceGroupUI;
    readonly stagedGroup: SourceControlResourceGroupUI;
    readonly trackedGroup: SourceControlResourceGroupUI;
    readonly untrackedGroup: SourceControlResourceGroupUI;
};

type SourceControlUI = {
    readonly inputBox: SourceControlInputBox;
    count: number;
    statusBarCommands: Command[];
    commitTemplate?: string;
};

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    // With some refactoring it will be possible to have a UI grace period
    resourceStates: Resource[];
};
