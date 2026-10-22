import type { Manifest } from "./manifest.js";

export interface CommandNamesModuleOptions {
    /** Prefix stripped from each declared command id, e.g. `git_monolithic.`. */
    readonly commandPrefix: string;
    /** Where the module was generated from, for the header comment. */
    readonly generatedFrom: string;
    /** How to regenerate the module, for the header comment. */
    readonly updateCommand: string;
}

export type CommandNamesModuleResult =
    | { readonly text: string; readonly errors?: undefined }
    | { readonly text?: undefined; readonly errors: readonly string[] };

/**
 * Generates a TypeScript module exporting `CommandName`, the union of declared command ids without their prefix.
 * The output is stable (sorted, deduplicated) and already formatted.
 */
export function generateCommandNamesModule(
    manifest: Manifest,
    { commandPrefix, generatedFrom, updateCommand }: CommandNamesModuleOptions,
): CommandNamesModuleResult {
    const errors = manifest.commands
        .filter(c => !c.id.startsWith(commandPrefix))
        .map(c => {
            const { file, line, column } = c.location;
            return `${file}:${line}:${column} Command "${c.id}" does not start with "${commandPrefix}".`;
        });
    if (errors.length > 0) {
        return { errors };
    }

    const names = [...new Set(manifest.commands.map(c => c.id.slice(commandPrefix.length)))].sort();
    const union = names.length === 0 ? " never" : names.map(n => `\n    | ${JSON.stringify(n)}`).join("");

    const text = [
        `// Generated from ${generatedFrom}. Do not edit.`,
        `// Update with: ${updateCommand}`,
        "",
        "/** Command ids declared in the manifest, without their prefix. */",
        `export type CommandName =${union};`,
        "",
    ].join("\n");
    return { text };
}
