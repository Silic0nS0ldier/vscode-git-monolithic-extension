import type { EventEmitter } from "vscode";
import type { Branch, Ref, Remote } from "../../api/git.js";
import type { SourceControlUIGroup } from "../../ui/source-control.js";
import type { Box } from "../../util.js";
import { RepositoryState, RepositoryStateOptions } from "../RepositoryState.js";

export function createStateBox(
    onDidChangeState: EventEmitter<RepositoryStateOptions>,
    HEAD: Box<Branch | undefined>,
    refs: Box<Ref[]>,
    remotes: Box<Remote[]>,
    sourceControlUI: SourceControlUIGroup,
): Box<RepositoryStateOptions> {
    let state = RepositoryState.Idle;

    return {
        get: () => state,
        set: (newState: RepositoryStateOptions) => {
            state = newState;

            HEAD.set(undefined);
            refs.set([]);
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
