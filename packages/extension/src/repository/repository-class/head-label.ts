import { SourceControlResourceGroup } from "vscode";
import { Branch, Ref, RefType } from "../../api/git.js";

export function headLabel(
    HEAD: Branch | undefined,
    refs: Ref[],
    workingTreeGroup: SourceControlResourceGroup,
    untrackedGroup: SourceControlResourceGroup,
    indexGroup: SourceControlResourceGroup,
    mergeGroup: SourceControlResourceGroup,
): string {
    if (!HEAD) {
        return "";
    }

    const tag = refs.filter(iref => iref.type === RefType.Tag && iref.commit === HEAD.commit)[0];
    const tagName = tag && tag.name;
    const head = HEAD.name || tagName || (HEAD.commit || "").substr(0, 8);

    return head
        + (workingTreeGroup.resourceStates.length + untrackedGroup.resourceStates.length > 0 ? "*" : "")
        + (indexGroup.resourceStates.length > 0 ? "+" : "")
        + (mergeGroup.resourceStates.length > 0 ? "!" : "");
}
