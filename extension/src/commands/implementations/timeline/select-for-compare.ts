import { commands, Uri } from "vscode";
import { GitTimelineItem } from "../../../timeline/item.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export type CompareSelection = { selected?: { uri: Uri; item: GitTimelineItem } };

export function createCommand(selection: CompareSelection): ScmCommand<"timelineSelectForCompare"> {
    return {
        commandId: makeCommandId("timelineSelectForCompare"),
        options: { repository: false },
        async method(item: unknown, uri: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !(uri instanceof Uri) || !item.resourceUri) {
                throw new Error("Expected a comparable file Timeline item");
            }
            selection.selected = { item, uri };
            await commands.executeCommand("setContext", "git_monolithic.timeline.selectedForCompare", true);
        },
    };
}
