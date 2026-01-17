import { commands } from "vscode";
import type { Commit } from "../../git/Commit.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import type { Box } from "../../util/box.js";

export function createRebaseCommitBox(
    sourceControlUI: SourceControlUIGroup,
): Box<Commit | undefined> {
    const inputBox = sourceControlUI.sourceControl.inputBox;
    let rebaseCommit: Commit | undefined = undefined;

    return {
        get: () => rebaseCommit,
        set: (newRebaseCommit): void => {
            if (rebaseCommit && !newRebaseCommit) {
                inputBox.value = "";
            } else if (newRebaseCommit && (!rebaseCommit || rebaseCommit.hash !== newRebaseCommit.hash)) {
                inputBox.value = newRebaseCommit.message;
            }

            rebaseCommit = newRebaseCommit;
            // TODO This is an anti-pattern as rebases can be initiated outside of this extension (by git)
            // And likewise rebases can be externally completed.
            commands.executeCommand("setContext", "git_monolithic.context.rebaseInProgress", !!rebaseCommit);
        },
    };
}
