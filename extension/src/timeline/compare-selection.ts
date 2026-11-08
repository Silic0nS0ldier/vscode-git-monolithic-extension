import { inspect } from "node:util";
import { commands, type Uri } from "vscode";
import { error } from "../tracing.js";
import type { GitTimelineItem } from "./item.js";

export type CompareSelection = { uri: Uri; item: GitTimelineItem };

const CONTEXT_KEY = "git_monolithic.timeline.selectedForCompare";

let selected: CompareSelection | undefined;

export function compareSelection(): CompareSelection | undefined {
    return selected;
}

export async function selectForCompare(selection: CompareSelection): Promise<void> {
    selected = selection;
    await commands.executeCommand("setContext", CONTEXT_KEY, true);
}

export function clearCompareSelection(): void {
    selected = undefined;
    void Promise.resolve(commands.executeCommand("setContext", CONTEXT_KEY, false))
        .catch(ex => error(`Resetting Timeline comparison selection failed; ex=${inspect(ex)}`));
}
