import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { Plugin } from "rollup";

type ModuleReplacement = readonly [modulePath: string, filePath: string];

export function moduleReplacementPlugin(replacements: readonly ModuleReplacement[]): Plugin {
    const filesByModule = new Map<string, string>();
    for (const [modulePath, filePath] of replacements) {
        const resolvedModulePath = path.resolve(modulePath);
        if (filesByModule.has(resolvedModulePath)) {
            throw new Error(`Multiple replacement files target module '${resolvedModulePath}'.`);
        }
        filesByModule.set(resolvedModulePath, path.resolve(filePath));
    }

    const matchedModules = new Set<string>();
    return {
        name: "module-replacement",
        async load(id) {
            const replacementFile = filesByModule.get(id);
            if (replacementFile === undefined) return null;
            matchedModules.add(id);
            return await readFile(replacementFile, "utf8");
        },
        buildEnd() {
            const unmatchedModules = [...filesByModule.keys()].filter(id => !matchedModules.has(id));
            if (unmatchedModules.length > 0) {
                this.error(`Module replacement did not match resolved module(s): ${unmatchedModules.join(", ")}`);
            }
        },
    };
}
