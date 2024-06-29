import { type Branch, type Ref, RefType } from "../../api/git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";

export function headLabel(
    HEAD: Branch | undefined,
    refs: Ref[],
    sourceControlUI: SourceControlUIGroup,
): string {
    if (!HEAD) {
        return "";
    }

    const tag = refs.filter(iref => iref.type === RefType.Tag && iref.commit === HEAD.commit)[0];
    const tagName = tag && tag.name;
    const head = HEAD.name || tagName || (HEAD.commit || "").substr(0, 8);

    return head
        + (sourceControlUI.trackedGroup.resourceStates.get().length
                    + sourceControlUI.untrackedGroup.resourceStates.get().length > 0
            ? "*"
            : "")
        + (sourceControlUI.stagedGroup.resourceStates.get().length > 0 ? "+" : "")
        + (sourceControlUI.mergeGroup.resourceStates.get().length > 0 ? "!" : "");
}
