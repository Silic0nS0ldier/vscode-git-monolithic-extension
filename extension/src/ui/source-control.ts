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
import * as config from "../util/config.js";

/**
 * An encapsulatin of the source control panel.
 * Eventually this will decouple UI state from application logic. For now it helps make existing
 * API usage easier to track.
 */
export function create(repoRoot: string, quickDiffProvider: QuickDiffProvider): SourceControlUIGroup & Disposable {
    const rootUri = Uri.file(repoRoot);

    const sourceControl = scm.createSourceControl("gitm", "Git", rootUri);
    sourceControl.acceptInputCommand = {
        arguments: [sourceControl],
        command: "git_monolithic.commit",
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
        mergeGroup: withUX(mergeGroup),
        sourceControl: sourceControl as unknown as SourceControlUI,
        stagedGroup: withUX(stagedGroup),
        trackedGroup: withUX(trackedGroup),
        untrackedGroup: withUX(untrackedGroup),
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

function withUX(group: SourceControlResourceGroup): SourceControlResourceGroupUI {
    let resources: readonly Resource[] = [];
    let latest: readonly Resource[] = [];
    let resourceStrings = new Set<string>();
    let pendingApply: ReturnType<typeof setTimeout> | undefined;
    const baseLabel = group.label;

    function apply(): void {
        clearTimeout(pendingApply);
        pendingApply = undefined;
        resources = latest;
        resourceStrings = new Set<string>(latest.map(r => r.resourceUri.toString()));

        const annotations: string[] = [];
        if (latest.length > 0) {
            if (latest.length >= 500) {
                // Only the first 5000 changes are shown in the UI (to prevent performance issues)
                // so we need to indicate a potentially incomplete view.
                // From this scope we cannot determine if there were 5000+ changes in total (e.g.
                // split across tracked and untracked groups) so we conservatively indicate too
                // many files on hitting 500.
                // TODO Thread through the actual answer.
                annotations.push("(too many files)");
            }
        } else {
            annotations.push("(empty)");
        }

        group.resourceStates = [...resources];
        group.label = baseLabel + (annotations.length > 0 ? ` ${annotations.join(" ")}` : "");
    }

    const resourceStates: Box<readonly Resource[]> = {
        get(): readonly Resource[] {
            return resources;
        },
        set(newValue): void {
            latest = newValue;

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

            const layoutShiftDelay = config.layoutShiftDelay();
            if (!mayCauseLayoutShift || layoutShiftDelay <= 0) {
                apply();
                return;
            }

            // Already faded; the pending apply takes the latest value, and restarting it would let
            // a stream of refreshes keep the view faded.
            if (pendingApply !== undefined) {
                return;
            }

            const annotations: string[] = [];
            const fadedResources: SourceControlResourceState[] = resources.map<SourceControlResourceState>(old => ({
                // Command carried over to allow viewing
                command: old.command,
                decorations: { faded: true },
                resourceUri: old.resourceUri,
            }));
            if (fadedResources.length > 0) {
                if (fadedResources.length >= 500) {
                    // Only the first 5000 changes are shown in the UI (to prevent performance issues)
                    // so we need to indicate a potentially incomplete view.
                    // From this scope we cannot determine if there were 5000+ changes in total (e.g.
                    // split across tracked and untracked groups) so we conservatively indicate too
                    // many files on hitting 500.
                    // TODO Thread through the actual answer.
                    annotations.push("(too many changes)");
                }
            } else {
                annotations.push("(empty)");
            }

            group.resourceStates = fadedResources;
            group.label = baseLabel + (annotations.length > 0 ? ` ${annotations.join(" ")}` : "");

            pendingApply = setTimeout(apply, layoutShiftDelay);
        },
    };
    return { latestResourceStates: () => latest, resourceStates };
}

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    readonly resourceStates: Box<readonly Resource[]>;
    /** The latest refresh, which `resourceStates` holds back while a layout shift is pending. */
    readonly latestResourceStates: () => readonly Resource[];
};
