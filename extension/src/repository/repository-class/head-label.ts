import * as i18n from "../../i18n/mod.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import { UnreachableError } from "../../util/unreachable-error.js";
import { HeadState, type HeadStateOptions } from "../HeadState.js";

function stateSuffix(state: HeadStateOptions): string {
    switch (state) {
        case HeadState.Attached:
            return "";
        case HeadState.Detached:
            return ` (${i18n.Translations.detached()})`;
        case HeadState.Rebasing:
            return ` (${i18n.Translations.rebasing()})`;
        default:
            throw new UnreachableError(state);
    }
}

export function headLabel(
    headShortName: string | undefined,
    state: HeadStateOptions,
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
        + (sourceControlUI.mergeGroup.resourceStates.get().length > 0 ? "!" : "")
        + stateSuffix(state);
}
