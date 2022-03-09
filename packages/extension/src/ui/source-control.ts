import path from "node:path";
import { setTimeout } from "node:timers";
import {
    Command,
    Disposable,
    QuickDiffProvider,
    scm,
    SourceControlInputBox,
    SourceControlResourceGroup,
    SourceControlResourceState,
    Uri,
} from "vscode";
import { Resource } from "../repository/Resource.js";
import { Box, localize } from "../util.js";

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
        mergeGroup: { resourceStates: withUX(mergeGroup, repoRoot) },
        sourceControl: sourceControl as unknown as SourceControlUI,
        stagedGroup: { resourceStates: withUX(stagedGroup, repoRoot) },
        trackedGroup: { resourceStates: withUX(trackedGroup, repoRoot) },
        untrackedGroup: { resourceStates: withUX(untrackedGroup, repoRoot) },
    };
}

export type SourceControlUIGroup = {
    readonly sourceControl: SourceControlUI;
    readonly mergeGroup: SourceControlResourceGroupUI;
    readonly stagedGroup: SourceControlResourceGroupUI;
    readonly trackedGroup: SourceControlResourceGroupUI;
    readonly untrackedGroup: SourceControlResourceGroupUI;
};

export type SourceControlUI = {
    readonly inputBox: SourceControlInputBox;
    count: number;
    statusBarCommands: Command[];
    commitTemplate?: string;
};

function withUX(group: SourceControlResourceGroup, repoRoot: string): Box<readonly Resource[]> {
    let resources: readonly Resource[] = [];
    const emptyResource: SourceControlResourceState = {
        decorations: { faded: true, tooltip: "Nothing to show here. For now..." },
        resourceUri: Uri.file(path.join(repoRoot, "(empty)")),
    };
    return {
        get() {
            // filter empty node
            return resources;
        },
        set(newValue) {
            // delay change with a faded look first
            // ideally do only when status is slow to run
            // TODO don't push state change to VSCode is nothing has changed
            const fadedResources: SourceControlResourceState[] = resources.map<SourceControlResourceState>(old => ({
                decorations: { faded: true },
                resourceUri: old.resourceUri,
            }));
            if (fadedResources.length > 0) {
                group.resourceStates = fadedResources;
            } else if (group.hideWhenEmpty !== true) {
                group.resourceStates = [emptyResource];
            }

            setTimeout(() => {
                resources = newValue;
                if (newValue.length > 0) {
                    group.resourceStates = newValue as Resource[];
                } else if (group.hideWhenEmpty !== true) {
                    group.resourceStates = [emptyResource];
                }
            }, 900);
        },
    };
}

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    readonly resourceStates: Box<readonly Resource[]>;
};
