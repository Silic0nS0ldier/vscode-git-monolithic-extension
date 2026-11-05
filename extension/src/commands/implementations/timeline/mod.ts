import { inspect } from "node:util";
import { commands, Disposable } from "vscode";
import type { Git } from "../../../git.js";
import type { Model } from "../../../model.js";
import { error } from "../../../tracing.js";
import * as compareWithSelected from "./compare-with-selected.js";
import * as copyCommitId from "./copy-commit-id.js";
import * as copyCommitMessage from "./copy-commit-message.js";
import * as openDiff from "./open-diff.js";
import * as selectForCompare from "./select-for-compare.js";
import * as viewCommit from "./view-commit.js";

export function createCommands(model: Model, git: Git, disposables: Disposable[]) {
    const selection: selectForCompare.CompareSelection = {};
    const clear = (): void => {
        delete selection.selected;
        void Promise.resolve(commands.executeCommand("setContext", "git_monolithic.timeline.selectedForCompare", false))
            .catch(ex => error(`Resetting Timeline comparison selection failed; ex=${inspect(ex)}`));
    };
    clear();
    disposables.push(
        new Disposable(clear),
        model.onDidCloseRepository(repository => {
            if (selection.selected?.item.rootUri.fsPath === repository.root) clear();
        }),
    );
    return [
        openDiff.createCommand(),
        viewCommit.createCommand(model, git),
        copyCommitId.createCommand(),
        copyCommitMessage.createCommand(),
        selectForCompare.createCommand(selection),
        compareWithSelected.createCommand(selection),
    ];
}
