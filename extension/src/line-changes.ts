import { _DefaultLinesDiffComputer as DefaultLinesDiffComputer, type _LineRange as LineRange } from "@vscode/diff";

/**
 * A changed block of lines, numbered from 1. When one side is empty its end line number is 0
 * and its start line number is the line the change follows (0 for the start of the document).
 */
export interface LineChange {
    readonly originalStartLineNumber: number;
    readonly originalEndLineNumber: number;
    readonly modifiedStartLineNumber: number;
    readonly modifiedEndLineNumber: number;
}

export interface LineChangesResult {
    readonly changes: LineChange[];
    readonly hitTimeout: boolean;
}

function toLineNumbers(range: LineRange): [start: number, end: number] {
    return range.isEmpty
        ? [range.startLineNumber - 1, 0]
        : [range.startLineNumber, range.endLineNumberExclusive - 1];
}

/**
 * Diffs two documents with the algorithm VSCode's diff editor uses by default, so that changes
 * line up with the hunks it displays.
 */
export function computeLineChanges(originalLines: string[], modifiedLines: string[]): LineChangesResult {
    const diff = new DefaultLinesDiffComputer().computeDiff(originalLines, modifiedLines, {
        computeMoves: false,
        extendToSubwords: false,
        ignoreTrimWhitespace: false,
        maxComputationTimeMs: 0,
    });
    return {
        changes: diff.changes.map(change => {
            const [originalStartLineNumber, originalEndLineNumber] = toLineNumbers(change.original);
            const [modifiedStartLineNumber, modifiedEndLineNumber] = toLineNumbers(change.modified);
            return { originalStartLineNumber, originalEndLineNumber, modifiedStartLineNumber, modifiedEndLineNumber };
        }),
        hitTimeout: diff.hitTimeout,
    };
}
