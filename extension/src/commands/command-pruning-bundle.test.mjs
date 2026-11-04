import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Verifies `//extension:pruning_test_bundle`, which bundles the extension with
 * `command_selection = ":pruning_test_selection"` selecting only `cherryPick`:
 *
 * - the virtual `pruned` helper is injected once unselected commands are rewritten;
 * - unselected commands — both `showOutput` (registered directly in `activate.ts`) and
 *   grouped commands such as `commit` — have their factory bodies replaced with `pruned(...)`;
 * - the selected command (`cherryPick`) keeps its implementation instead of being pruned;
 * - unselected command bodies (`publishFn`, `stashWithoutUntracked`) are tree-shaken out of the
 *   bundle, even when their modules (`publish/publish.ts`, `stash/stash.ts`) still have other
 *   exports or sibling helpers imported by core/other modules.
 */
const bundlePath = process.argv[2];
assert.ok(bundlePath, "Expected the pruned main bundle path as an argument.");

const bundle = readFileSync(bundlePath, "utf8");

assert.match(
    bundle,
    /is not in this build: the integration test suite did not declare it/,
    "Expected the pruned-command failure helper to be injected into the pruned bundle.",
);
assert.match(
    bundle,
    /pruned\(makeCommandId\("showOutput"\), "showOutput"\)/,
    "Expected the unselected showOutput command (registered in activate.ts) to be pruned.",
);
assert.match(
    bundle,
    /pruned\(makeCommandId\("commit"\), "commit"\)/,
    "Expected the unselected commit command to be pruned.",
);
assert.doesNotMatch(
    bundle,
    /pruned\(makeCommandId\("cherryPick"\), "cherryPick"\)/,
    "Expected the selected cherryPick command not to be replaced with pruned(...).",
);
assert.match(
    bundle,
    /repository\.cherryPick\(hash\)/,
    "Expected the selected cherryPick command implementation to remain in the bundle.",
);
assert.doesNotMatch(
    bundle,
    /function publishFn\(/,
    "Expected the unselected publish command handler to be tree-shaken from the bundle.",
);
assert.doesNotMatch(
    bundle,
    /function stashWithoutUntracked\(/,
    "Expected the unselected stash command handler to be tree-shaken even when stash helpers are referenced elsewhere.",
);
