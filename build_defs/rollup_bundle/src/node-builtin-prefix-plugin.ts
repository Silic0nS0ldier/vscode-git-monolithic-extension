import { builtinModules } from "node:module";
import type { Plugin } from "rollup";

/**
 * Rollup plugin that normalizes every reference to a Node.js builtin module
 * (e.g. `"fs"`, `"node:fs"`) to its `node:`-prefixed form and marks it
 * external. Without this, dependencies that `require()` builtins with a bare
 * specifier (no `node:` prefix) end up contributing a second, separate
 * external import for the same module, since Rollup otherwise treats `"fs"`
 * and `"node:fs"` as distinct module ids.
 */
export function nodeBuiltinPrefixPlugin(): Plugin {
    const builtins = new Set(builtinModules);

    return {
        name: "node-builtin-prefix",
        resolveId(source) {
            if (source.startsWith("node:")) {
                return { id: source, external: true };
            }
            if (builtins.has(source)) {
                return { id: `node:${source}`, external: true };
            }
            return null;
        },
    };
}
