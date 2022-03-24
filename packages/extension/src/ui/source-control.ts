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
import type { Resource } from "../repository/Resource.js";
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
        mergeGroup: { resourceStates: withUX(mergeGroup) },
        sourceControl: sourceControl as unknown as SourceControlUI,
        stagedGroup: { resourceStates: withUX(stagedGroup) },
        trackedGroup: { resourceStates: withUX(trackedGroup) },
        untrackedGroup: { resourceStates: withUX(untrackedGroup) },
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

function withUX(group: SourceControlResourceGroup): Box<readonly Resource[]> {
    let resources: readonly Resource[] = [];
    const baseLabel = group.label;
    return {
        get() {
            // filter empty node
            return resources;
        },
        set(newValue) {
            // delay change with a faded look first
            // ideally do only when status is slow to run
            // TODO don't push state change to VSCode if nothing has changed
            {
                const annotations: string[] = [];
                const fadedResources: SourceControlResourceState[] = resources.map<SourceControlResourceState>(old => ({
                    command: old.command,
                    decorations: { faded: true },
                    resourceUri: old.resourceUri,
                }));
                if (fadedResources.length > 0) {
                    if (fadedResources.length >= 500) {
                        // 500 used as the of limit 5000 is shared by multiple groups
                        // 500 may seem low, but should 99% of cases until a more reliable solution
                        // is used.
                        annotations.push("(too many changes)");
                    }
                } else {
                    annotations.push("(empty)");
                }

                group.resourceStates = fadedResources;
                group.label = baseLabel + (annotations.length > 0 ? ` ${annotations.join(" ")}` : "");
            }

            setTimeout(() => {
                resources = newValue;

                const annotations: string[] = [];
                if (newValue.length > 0) {
                    if (newValue.length >= 500) {
                        // 500 used as the of limit 5000 is shared by multiple groups
                        // 500 may seem low, but should 99% of cases until a more reliable solution
                        // is used.
                        annotations.push("(too many files)");
                    }
                } else {
                    annotations.push("(empty)");
                }

                group.resourceStates = [...resources];
                group.label = baseLabel + (annotations.length > 0 ? ` ${annotations.join(" ")}` : "");
            }, 900);
        },
    };
}

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    readonly resourceStates: Box<readonly Resource[]>;
};
