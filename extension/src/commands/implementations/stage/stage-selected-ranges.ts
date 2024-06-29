import assert from "node:assert";
import { EndOfLine, type OutputChannel, Uri, window } from "vscode";
import vsDiff from "vscode-diff";
import { prettyPrint } from "../../../logging/pretty-print.js";
import { intersectDiffWithRange, toLineRanges } from "../../../staging.js";
import type { ScmCommand } from "../../helpers.js";
import { stageChanges } from "./helpers.js";
import type { Model } from "../../../model.js";

function getEOLChar(eol: EndOfLine): string {
    switch (eol) {
        case EndOfLine.LF:
            return "\n";
        case EndOfLine.CRLF:
            return "\r\n";
        default:
            throw new Error(`Unknown EOL option ${eol}`);
    }
}

// "current" diff state shows as file://... and is backed by FS
// "past" diff state shows as git:/... and is readonly
// This command relies on some hackery, as the original implementation relies on an experimental
// API surface that will be removed in favour of something different.
export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function stageSelectedRanges(fileUri: unknown, ..._rest: unknown[]): Promise<void> {
        assert(fileUri instanceof Uri, "API has changed");

        const activeEditor = window.activeTextEditor;
        const visibleEditors = window.visibleTextEditors;

        const failGoalMessage = `Could not stage selections for ${fileUri.fsPath}`;

        // Confirm correct active editor
        // 1. Editor with current state must be active
        if (!activeEditor) {
            return void window.showErrorMessage(`No editor is active. ${failGoalMessage}`);
        }
        if (activeEditor.document.uri.toString() !== fileUri.toString()) {
            return void window.showErrorMessage(`Active editor is for a different file. ${failGoalMessage}`);
        }
        // 2. And underlying file must only appear in 1 visible editor
        if (visibleEditors.filter(ve => ve.document.uri.toString() === fileUri.toString()).length > 1) {
            return void window.showErrorMessage(`File open in multiple visible editors. ${failGoalMessage}`);
        }
        const current = activeEditor.document;

        // Grab selections now (in case state changes)
        const selections = activeEditor.selections;

        // Find editor with older state
        const olderStateEditors = visibleEditors.filter(e => {
            return (e.document.uri.scheme === "git")
                && (e.document.uri.fsPath === fileUri.fsPath);
        });
        if (olderStateEditors.length > 1) {
            return void window.showErrorMessage(`Multiple instances of diff base editor found. ${failGoalMessage}`);
        } else if (olderStateEditors.length === 0) {
            return void window.showErrorMessage(`Diff base editor not found. ${failGoalMessage}`);
        }
        const olderStateEditor = olderStateEditors[0];
        const base = olderStateEditor.document;

        // Use VSCode diff algorithm to obtain line changes
        const currentLines = current.getText().split(getEOLChar(current.eol));
        const baseLines = base.getText().split(getEOLChar(base.eol));
        const diffComputer = new vsDiff.DiffComputer(baseLines, currentLines, {
            maxComputationTime: 0,
            shouldComputeCharChanges: true,
            shouldIgnoreTrimWhitespace: false,
            shouldMakePrettyDiff: false,
            shouldPostProcessCharChanges: true,
        });
        const diffResult = diffComputer.computeDiff();
        if (diffResult.quitEarly === true) {
            return void window.showErrorMessage(
                `Diff computation was aborted, potentially due to a large file. ${failGoalMessage}`,
            );
        }
        const changes = diffResult.changes;
        outputChannel.appendLine(await prettyPrint(changes));

        // Convert selections into line changes
        const selectedLines = toLineRanges(selections, current);
        const selectedChanges = changes
            .map(diff =>
                selectedLines.reduce<vsDiff.ILineChange | null>(
                    (result, range) => result || intersectDiffWithRange(current, diff, range),
                    null,
                )
            )
            .filter(d => !!d) as vsDiff.ILineChange[];

        // Stage
        await stageChanges(model, base, current, selectedChanges);
    }

    return {
        commandId: "git.stageSelectedRanges",
        method: stageSelectedRanges,
        options: {
            diff: true,
        },
    };
}
