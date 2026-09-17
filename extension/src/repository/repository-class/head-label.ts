import type { SourceControlUIGroup } from "../../ui/source-control.js";

export function headLabel(
    headShortName: string | undefined,
    sourceControlUI: SourceControlUIGroup,
): string {
    if (headShortName === undefined) {
        return "";
    }

    return headShortName
        + (sourceControlUI.trackedGroup.resourceStates.get().length
                    + sourceControlUI.untrackedGroup.resourceStates.get().length > 0
            ? "*"
            : "")
        + (sourceControlUI.stagedGroup.resourceStates.get().length > 0 ? "+" : "")
        + (sourceControlUI.mergeGroup.resourceStates.get().length > 0 ? "!" : "");
}
