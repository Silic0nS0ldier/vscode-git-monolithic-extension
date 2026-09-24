/**
 * Environment every git invocation the extension makes runs with, on top of the ambient
 * process environment. The forced entries win over both the extension's own environment
 * (askpass wiring) and any per-call additions: `LANG`/`LC_ALL` because the error handling
 * matches on English messages, and `VSCODE_GIT_COMMAND` because the askpass helper reads it.
 */
export function cliEnv(
    base: { readonly [key: string]: string | undefined },
    command: string,
    extra: { readonly [key: string]: string | undefined } = {},
): { [key: string]: string | undefined } {
    return {
        ...base,
        ...extra,
        GIT_PAGER: "cat",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        VSCODE_GIT_COMMAND: command,
    };
}
