import type { Git } from "../../../git.js";
import type { Model } from "../../../model.js";
import * as copyCommitId from "./copy-commit-id.js";
import * as copyCommitMessage from "./copy-commit-message.js";
import * as openDiff from "./open-diff.js";
import * as viewCommit from "./view-commit.js";

export function createCommands(model: Model, git: Git) {
    return [
        openDiff.createCommand(),
        viewCommit.createCommand(model, git),
        copyCommitId.createCommand(),
        copyCommitMessage.createCommand(),
    ];
}
