import type { LogOutputChannel } from "vscode";

/**
 * Where a log call is in the source. The extension bundle passes each call its own static object (see
 * `build_defs/rollup_bundle/src/callsite-plugin.ts`); calls from unbundled code, such as unit tests, have none.
 * Call the log functions directly, with only the message.
 */
export interface Callsite {
    /** Path of the source file, relative to the repository root. */
    readonly file: string;
    /** 1-based. */
    readonly line: number;
    /** 1-based. */
    readonly column: number;
}

// NOTE: Implicitly uses `text/x-code-log-output` as the MIME type, which affects syntax highlighting in the output channel.
let outputChannel: LogOutputChannel | undefined;
export function setOutputChannel(oc: LogOutputChannel) {
    outputChannel = oc;
}
export function unsetOutputChannel() {
    outputChannel = undefined;
}

let callsiteFilter: readonly RegExp[] | undefined;
// Call sites are static objects, so each is matched once per filter.
let callsiteVerdicts = new WeakMap<Callsite, boolean>();

/**
 * Only logs calls whose call site fully matches any of `patterns`, regular expressions; see {@link callsiteNames}. An
 * empty list logs none. Calls without a call site are always logged, as are all calls while no list is set. A list
 * containing `.*`, the setting's default, is treated as no list; it matches every name, as the bundle guarantees names
 * have no line terminators. Throws a `SyntaxError` if any pattern is not a valid regular expression, leaving the
 * current filter in place.
 */
export function setCallsiteFilter(patterns: readonly string[] | undefined): void {
    const filter = patterns === undefined || patterns.includes(".*")
        ? undefined
        : patterns.map(pattern => new RegExp(`^(?:${pattern})$`, "u"));
    callsiteFilter = filter;
    callsiteVerdicts = new WeakMap();
}

/**
 * The names a call site is matched by; the filter selects it if any matches. Only its location,
 * `<file>:<line>:<column>` as VSCode shows source locations, for now. Other forms, such as the enclosing function as
 * `<file>@<function>`, can be added here without changing existing filters' meaning for the location form.
 */
function callsiteNames(callsite: Callsite): string[] {
    return [`${callsite.file}:${callsite.line}:${callsite.column}`];
}

function isSelected(callsite: Callsite | undefined): boolean {
    if (callsite === undefined || callsiteFilter === undefined) return true;
    let verdict = callsiteVerdicts.get(callsite);
    if (verdict === undefined) {
        const filter = callsiteFilter;
        verdict = callsiteNames(callsite).some(name => filter.some(pattern => pattern.test(name)));
        callsiteVerdicts.set(callsite, verdict);
    }
    return verdict;
}

export function trace(msg: string, callsite?: Callsite) {
    if (isSelected(callsite)) outputChannel?.trace(msg);
}

export function debug(msg: string, callsite?: Callsite) {
    if (isSelected(callsite)) outputChannel?.debug(msg);
}

export function info(msg: string, callsite?: Callsite) {
    if (isSelected(callsite)) outputChannel?.info(msg);
}

export function warn(msg: string, callsite?: Callsite) {
    if (isSelected(callsite)) outputChannel?.warn(msg);
}

export function error(msg: string, callsite?: Callsite) {
    if (isSelected(callsite)) outputChannel?.error(msg);
}
