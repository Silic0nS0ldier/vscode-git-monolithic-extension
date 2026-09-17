import type { EventEmitter } from "vscode";
import type { Branch, Remote } from "../../api/git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import type { Box } from "../../util/box.js";
import { RepositoryState, type RepositoryStateOptions } from "../RepositoryState.js";

export function createStateBox(
    onDidChangeState: EventEmitter<RepositoryStateOptions>,
    HEAD: Box<Branch | undefined>,
    headTagName: Box<string | undefined>,
    remotes: Box<Remote[]>,
    sourceControlUI: SourceControlUIGroup,
): Box<RepositoryStateOptions> {
    let state = RepositoryState.Idle;

    return {
        get: () => state,
        set: (newState: RepositoryStateOptions): void => {
            state = newState;

            HEAD.set(undefined);
            headTagName.set(undefined);
            remotes.set([]);
            sourceControlUI.mergeGroup.resourceStates.set([]);
            sourceControlUI.stagedGroup.resourceStates.set([]);
            sourceControlUI.trackedGroup.resourceStates.set([]);
            sourceControlUI.untrackedGroup.resourceStates.set([]);
            sourceControlUI.sourceControl.count = 0;

            onDidChangeState.fire(state);
        },
    };
}
