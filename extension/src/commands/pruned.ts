import { appendFileSync } from "node:fs";
import type { CommandName } from "./command-names.gen.js";
import { makeCommandId, type ScmCommand } from "./helpers.js";

export function pruned<N extends CommandName>(name: N): ScmCommand<N> {
    return {
        commandId: makeCommandId(name),
        method: () => {
            const log = process.env["GIT_MONOLITHIC_ITEST_PRUNED_LOG"];
            if (log !== undefined) {
                appendFileSync(log, `${name}\n`);
            }
            // This message is test-only; production bundles never reference pruned commands.
            throw new Error(`'${name}' is not in this build: the integration test suite did not declare it`);
        },
        options: {},
    };
}
