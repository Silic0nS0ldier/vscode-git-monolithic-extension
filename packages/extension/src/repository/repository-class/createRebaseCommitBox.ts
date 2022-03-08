import { commands } from "vscode";
import { Commit } from "../../git/Commit.js";
import { SourceControlUIGroup } from "../../ui/source-control.js";
import { Box } from "../../util.js";

export function createRebaseCommitBox(
    sourceControlUI: SourceControlUIGroup,
): Box<Commit | undefined> {
    const inputBox = sourceControlUI.sourceControl.inputBox;
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
