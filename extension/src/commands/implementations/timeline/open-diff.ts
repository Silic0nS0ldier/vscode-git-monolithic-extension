import { commands, Uri, ViewColumn } from "vscode";
import { GitTimelineItem, resolveOpenDiff } from "../../../timeline/item.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand<"timelineOpenDiff"> {
    return {
        commandId: makeCommandId("timelineOpenDiff"),
        options: { repository: false },
        async method(item: unknown, uri: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !(uri instanceof Uri)) {
                throw new Error("Expected a file Timeline item");
            }
            const command = resolveOpenDiff(item, uri, {
                preserveFocus: true,
                preview: true,
                viewColumn: ViewColumn.Active,
            });
            await commands.executeCommand(command.command, ...(command.arguments ?? []));
        },
    };
}
