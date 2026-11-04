import type { LogOutputChannel } from "vscode";

// NOTE: Implicitly uses `text/x-code-log-output` as the MIME type, which affects syntax highlighting in the output channel.
let outputChannel: LogOutputChannel | undefined;
export function setOutputChannel(oc: LogOutputChannel) {
    outputChannel = oc;
}
export function unsetOutputChannel() {
    outputChannel = undefined;
}

export function trace(msg: string) {
    outputChannel?.trace(msg);
}

export function debug(msg: string) {
    outputChannel?.debug(msg);
}

export function info(msg: string) {
    outputChannel?.info(msg);
}

export function warn(msg: string) {
    outputChannel?.warn(msg);
}

export function error(msg: string) {
    outputChannel?.error(msg);
}
