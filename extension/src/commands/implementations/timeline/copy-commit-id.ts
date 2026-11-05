import { env } from "vscode";
import { GitTimelineItem } from "../../../timeline/item.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(): ScmCommand<"timelineCopyCommitId"> {
    return {
        commandId: makeCommandId("timelineCopyCommitId"),
        options: { repository: false },
        async method(item: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !item.contextValue?.endsWith(":commit")) {
                throw new Error("Expected a committed Timeline item");
            }
            await env.clipboard.writeText(item.ref);
        },
    };
}
