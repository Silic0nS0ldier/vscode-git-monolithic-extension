import { commands, Uri } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import { GitTimelineItem, itemTitle } from "../../../timeline/item.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import type { CompareSelection } from "./select-for-compare.js";

export function createCommand(selection: CompareSelection): ScmCommand<"timelineCompareWithSelected"> {
    return {
        commandId: makeCommandId("timelineCompareWithSelected"),
        options: { repository: false },
        async method(item: unknown, uri: unknown): Promise<void> {
            const selected = selection.selected;
            if (
                !(item instanceof GitTimelineItem) || !(uri instanceof Uri) || !item.resourceUri
                || !selected?.item.resourceUri || uri.toString() !== selected.uri.toString()
            ) {
                throw new Error("Select a Timeline version of the same file before comparing");
            }
            await commands.executeCommand(
                "vscode.diff",
                selected.item.resourceUri,
                item.resourceUri,
                i18n.Translations.timelineCompareTitle(itemTitle(selected.item, uri), itemTitle(item, uri)),
            );
        },
    };
}
