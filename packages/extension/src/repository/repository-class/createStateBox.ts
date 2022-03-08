import { EventEmitter } from "vscode";
import { Branch, Ref, Remote } from "../../api/git.js";
import { SourceControlUIGroup } from "../../ui/source-control.js";
import { Box } from "../../util.js";
import { RepositoryState } from "../RepositoryState.js";

export function createStateBox(
    onDidChangeState: EventEmitter<RepositoryState>,
    HEAD: Box<Branch | undefined>,
    refs: Box<Ref[]>,
    remotes: Box<Remote[]>,
    sourceControlUI: SourceControlUIGroup,
): Box<RepositoryState> {
    let state = RepositoryState.Idle;

    return {
        get: () => state,
        set: (newState: RepositoryState) => {
            state = newState;
            onDidChangeState.fire(state);

            HEAD.set(undefined);
            refs.set([]);
            remotes.set([]);
            sourceControlUI.mergeGroup.resourceStates = [];
            sourceControlUI.indexGroup.resourceStates = [];
            sourceControlUI.workingTreeGroup.resourceStates = [];
            sourceControlUI.untrackedGroup.resourceStates = [];
            sourceControlUI.sourceControl.count = 0;
        },
    };
}
