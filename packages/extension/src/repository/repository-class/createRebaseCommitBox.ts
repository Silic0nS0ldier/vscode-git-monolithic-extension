import { commands, SourceControlInputBox } from "vscode";
import { Commit } from "../../git/Commit.js";
import { Box } from "../../util.js";

export function createRebaseCommitBox(
    inputBox: SourceControlInputBox,
): Box<Commit | undefined> {
    let rebaseCommit: Commit | undefined = undefined;

    return {
        get: () => rebaseCommit,
        set: (newRebaseCommit) => {
            if (rebaseCommit && !newRebaseCommit) {
                inputBox.value = "";
            } else if (newRebaseCommit && (!rebaseCommit || rebaseCommit.hash !== newRebaseCommit.hash)) {
                inputBox.value = newRebaseCommit.message;
            }

            rebaseCommit = newRebaseCommit;
            commands.executeCommand("setContext", "gitRebaseInProgress", !!rebaseCommit);
        },
    };
}
