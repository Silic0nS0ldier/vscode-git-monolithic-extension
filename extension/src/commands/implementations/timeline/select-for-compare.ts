import { Uri } from "vscode";
import { selectForCompare } from "../../../timeline/compare-selection.js";
import { GitTimelineItem } from "../../../timeline/item.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand<"timelineSelectForCompare"> {
    return {
        commandId: makeCommandId("timelineSelectForCompare"),
        options: { repository: false },
        async method(item: unknown, uri: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !(uri instanceof Uri) || !item.resourceUri) {
                throw new Error("Expected a comparable file Timeline item");
            }
            await selectForCompare({ item, uri });
        },
    };
}
