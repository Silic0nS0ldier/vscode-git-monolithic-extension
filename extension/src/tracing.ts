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

export function trace(msg: string, _callsite?: Callsite) {
    outputChannel?.trace(msg);
}

export function debug(msg: string, _callsite?: Callsite) {
    outputChannel?.debug(msg);
}

export function info(msg: string, _callsite?: Callsite) {
    outputChannel?.info(msg);
}

export function warn(msg: string, _callsite?: Callsite) {
    outputChannel?.warn(msg);
}

export function error(msg: string, _callsite?: Callsite) {
    outputChannel?.error(msg);
}
