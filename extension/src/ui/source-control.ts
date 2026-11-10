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
import { makeCommandId } from "../commands/helpers.js";
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
        command: makeCommandId("commit"),
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
    let refreshFailed = false;
    const baseLabel = group.label;

    /** A failed refresh is flagged whether or not the group still lists its last known resources. */
    function annotate(count: number, tooMany: string): string {
        const annotations: string[] = [];
        if (refreshFailed) {
            annotations.push(i18n.Translations.refreshFailedAnnotation());
        } else if (count === 0) {
            annotations.push("(empty)");
        }
        if (count >= 500) {
            // Only the first 5000 changes are shown in the UI (to prevent performance issues)
            // so we need to indicate a potentially incomplete view.
            // From this scope we cannot determine if there were 5000+ changes in total (e.g.
            // split across tracked and untracked groups) so we conservatively indicate too
            // many files on hitting 500.
            // TODO Thread through the actual answer.
            annotations.push(tooMany);
        }
        return baseLabel + (annotations.length > 0 ? ` ${annotations.join(" ")}` : "");
    }

    function apply(): void {
        clearTimeout(pendingApply);
        pendingApply = undefined;
        resources = latest;
        resourceStrings = new Set<string>(latest.map(r => r.resourceUri.toString()));

        group.resourceStates = [...resources];
        group.label = annotate(latest.length, "(too many files)");
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

            const fadedResources: SourceControlResourceState[] = resources.map<SourceControlResourceState>(old => ({
                // Command carried over to allow viewing
                command: old.command,
                decorations: { faded: true },
                resourceUri: old.resourceUri,
            }));
            group.resourceStates = fadedResources;
            group.label = annotate(fadedResources.length, "(too many changes)");

            pendingApply = setTimeout(apply, layoutShiftDelay);
        },
    };
    return {
        latestResourceStates: () => latest,
        resourceStates,
        setRefreshFailed(failed): void {
            if (refreshFailed === failed) {
                return;
            }
            refreshFailed = failed;
            // A pending change applies the flag along with itself.
            if (pendingApply === undefined) {
                group.label = annotate(resources.length, "(too many files)");
            }
        },
    };
}

export type SourceControlResourceGroupUI = {
    // TODO This is used extensively as the source of truth, which couples the UI to application logic tightly
    readonly resourceStates: Box<readonly Resource[]>;
    /** The latest refresh, which `resourceStates` holds back while a layout shift is pending. */
    readonly latestResourceStates: () => readonly Resource[];
    /**
     * Labels the group as having failed to refresh, alongside whatever it still lists. Takes effect at once, or with a
     * pending change of resources.
     */
    readonly setRefreshFailed: (failed: boolean) => void;
};
