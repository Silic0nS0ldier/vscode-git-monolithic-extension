import { setTimeout } from "node:timers";
import {
    type Command,
    Disposable,
    type QuickDiffProvider,
    scm,
    type SourceControlInputBox,
    type SourceControlResourceGroup,
    type SourceControlResourceState,
    Uri,
} from "vscode";
import * as i18n from "../i18n/mod.js";
import type { Resource } from "../repository/Resource.js";
import type { Box } from "../util/box.js";

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
        title: i18n.Translations.commit(),
    };
    sourceControl.quickDiffProvider = quickDiffProvider;

    const mergeGroup = sourceControl.createResourceGroup(
        "merge",
        i18n.Translations.mergeChanges(),
    );
    const stagedGroup = sourceControl.createResourceGroup(
        "index",
        i18n.Translations.stagedChanges(),
    );
    const trackedGroup = sourceControl.createResourceGroup(
        "tracked",
        i18n.Translations.trackedChanges(),
    );
    const untrackedGroup = sourceControl.createResourceGroup(
        "untracked",
        i18n.Translations.untrackedChanges(),
    );

    mergeGroup.hideWhenEmpty = true;

    return {
        dispose(): void {
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
    let resourceStrings = new Set<string>();
    const baseLabel = group.label;
    return {
        get(): readonly Resource[] {
            return resources;
        },
        set(newValue): void {
            // Unexpected layout shifts can be expensive (e.g. accidentally reverting wrong file)
            // To avoid this we provide a grace period when the files shown change
            let mayCauseLayoutShift = true;

            if (newValue.length === resources.length) {
                // Possibly unchanged, check more closely
                if (newValue.every(nr => resourceStrings.has(nr.resourceUri.toString()))) {
                    // No change or decorations only, no need for grace period
                    mayCauseLayoutShift = false;
                }
            }

            function apply(): void {
                resources = newValue;
                resourceStrings = new Set<string>(newValue.map(r => r.resourceUri.toString()));

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
            }

            if (mayCauseLayoutShift) {
                const annotations: string[] = [];
                const fadedResources: SourceControlResourceState[] = resources.map<SourceControlResourceState>(old => ({
                    // Command carried over to allow viewing
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

                setTimeout(apply, 900);
            } else {
                apply();
            }
        },
    };
}

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    readonly resourceStates: Box<readonly Resource[]>;
};
