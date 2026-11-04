import { type Disposable, workspace } from "vscode";
import { setCallsiteFilter, warn } from "../tracing.js";
import * as config from "../util/config.js";

/** Applies `git_monolithic.log.callsiteFilter` to the logger, now and whenever it changes. */
export function watchLogFilter(): Disposable {
    applyLogFilter();
    return workspace.onDidChangeConfiguration(e => {
        if (config.logCallsiteFilter.affected(e)) applyLogFilter();
    });
}

function applyLogFilter(): void {
    try {
        setCallsiteFilter(config.logCallsiteFilter());
    } catch (e) {
        setCallsiteFilter(undefined);
        warn(
            "Logging all calls, as `git_monolithic.log.callsiteFilter` has an invalid regular expression: "
                + (e instanceof Error ? e.message : String(e)),
        );
    }
}
