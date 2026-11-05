import { env } from "vscode";
import { GitTimelineItem } from "../../../timeline/item.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand<"timelineCopyCommitMessage"> {
    return {
        commandId: makeCommandId("timelineCopyCommitMessage"),
        options: { repository: false },
        async method(item: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !item.contextValue?.endsWith(":commit")) {
                throw new Error("Expected a committed Timeline item");
            }
            await env.clipboard.writeText(item.message);
        },
    };
}
