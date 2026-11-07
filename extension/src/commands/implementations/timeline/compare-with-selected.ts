import { commands, Uri } from "vscode";
import * as i18n from "../../../i18n/mod.js";
import { compareSelection } from "../../../timeline/compare-selection.js";
import { GitTimelineItem, itemTitle } from "../../../timeline/item.js";
import { fromGitUri } from "../../../uri.js";
import { pathEquals } from "../../../util/paths.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

/** The file a Timeline is shown for, which is a `gitm:` URI once a Timeline diff is open. */
function filePath(uri: Uri): string {
    return uri.scheme === "gitm" ? fromGitUri(uri).path : uri.fsPath;
}

export function createCommand(): ScmCommand<"timelineCompareWithSelected"> {
    return {
        commandId: makeCommandId("timelineCompareWithSelected"),
        options: { repository: false },
        async method(item: unknown, uri: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !(uri instanceof Uri) || !item.resourceUri) {
                throw new Error("Expected a comparable file Timeline item");
            }
            const selected = compareSelection();
            // The menu item can outlive a selection made for another file, so there is nothing to compare with.
            if (!selected?.item.resourceUri || !pathEquals(filePath(uri), filePath(selected.uri))) return;
            await commands.executeCommand(
                "vscode.diff",
                selected.item.resourceUri,
                item.resourceUri,
                i18n.Translations.timelineCompareTitle(itemTitle(selected.item, uri), itemTitle(item, uri)),
            );
        },
    };
}
