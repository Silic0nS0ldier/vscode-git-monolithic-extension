import type { Git } from "../../../git.js";
import type { Model } from "../../../model.js";
import { GitTimelineItem } from "../../../timeline/item.js";
import { openCommit } from "../../../timeline/open-commit.js";
import { makeCommandId, type ScmCommand } from "../../helpers.js";

export function createCommand(model: Model, git: Git): ScmCommand<"timelineViewCommit"> {
    return {
        commandId: makeCommandId("timelineViewCommit"),
        options: { repository: false },
        async method(item: unknown): Promise<void> {
            if (!(item instanceof GitTimelineItem) || !item.contextValue?.endsWith(":commit")) {
                throw new Error("Expected a committed Timeline item");
            }
            await openCommit(model, git, item);
        },
    };
}
