import { EventEmitter, SourceControl, SourceControlResourceGroup } from "vscode";
import { Branch, Ref, Remote } from "../../api/git.js";
import { Box } from "../../util.js";
import { RepositoryState } from "../RepositoryState.js";

export function createStateBox(
    onDidChangeState: EventEmitter<RepositoryState>,
    HEAD: Box<Branch | undefined>,
    refs: Box<Ref[]>,
    remotes: Box<Remote[]>,
    mergeGroup: SourceControlResourceGroup,
    indexGroup: SourceControlResourceGroup,
    workingTreeGroup: SourceControlResourceGroup,
    untrackedGroup: SourceControlResourceGroup,
    sourceControl: SourceControl,
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
            mergeGroup.resourceStates = [];
            indexGroup.resourceStates = [];
            workingTreeGroup.resourceStates = [];
            untrackedGroup.resourceStates = [];
            sourceControl.count = 0;
        },
    };
}
