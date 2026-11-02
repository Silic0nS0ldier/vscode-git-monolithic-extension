import type { Manifest } from "./manifest.js";

export interface CommandNamesModuleOptions {
    /** Prefix stripped from each declared command id, e.g. `git_monolithic.`. */
    readonly commandPrefix: string;
    /** Where the module was generated from, for the header comment. */
    readonly generatedFrom: string;
    /** How to regenerate the module, for the header comment. */
    readonly updateCommand: string;
}

export interface CommandSelectionModuleOptions extends CommandNamesModuleOptions {
    /** Commands selected for this bundle. Omit to select every command. */
    readonly selectedCommands?: readonly string[];
}

export type CommandNamesModuleResult =
    | { readonly text: string; readonly errors?: undefined }
    | { readonly text?: undefined; readonly errors: readonly string[] };

const RESERVED_IDENTIFIERS = new Set([
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
]);

const IDENTIFIER = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u;

function getCommandNames(
    manifest: Manifest,
    commandPrefix: string,
): { readonly names: readonly string[]; readonly errors?: undefined } | {
    readonly names?: undefined;
    readonly errors: readonly string[];
} {
    const errors = manifest.commands
        .filter(c => !c.id.startsWith(commandPrefix))
        .map(c => {
            const { file, line, column } = c.location;
            return `${file}:${line}:${column} Command "${c.id}" does not start with "${commandPrefix}".`;
        });
    if (errors.length > 0) {
        return { errors };
    }

    return {
        names: [...new Set(manifest.commands.map(c => c.id.slice(commandPrefix.length)))].sort(),
    };
}

/**
 * Generates a TypeScript module exporting `CommandName`, the union of declared command ids without their prefix.
 * The output is stable (sorted, deduplicated) and already formatted.
 */
export function generateCommandNamesModule(
    manifest: Manifest,
    { commandPrefix, generatedFrom, updateCommand }: CommandNamesModuleOptions,
): CommandNamesModuleResult {
    const result = getCommandNames(manifest, commandPrefix);
    if (result.errors) {
        return { errors: result.errors };
    }

    const { names } = result;
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

/**
 * Generates a module of build-time command-selection constants, sorted by command name.
 * The output is stable and already formatted.
 */
export function generateCommandSelectionModule(
    manifest: Manifest,
    { commandPrefix, generatedFrom, updateCommand, selectedCommands }: CommandSelectionModuleOptions,
): CommandNamesModuleResult {
    const result = getCommandNames(manifest, commandPrefix);
    if (result.errors) {
        return { errors: result.errors };
    }

    const { names } = result;
    const invalidNames = names.filter(name => !IDENTIFIER.test(name) || RESERVED_IDENTIFIERS.has(name));
    const invalidNameErrors = invalidNames.map(name => {
        const command = manifest.commands.find(c => c.id === commandPrefix + name)!;
        const { file, line, column } = command.location;
        return `${file}:${line}:${column} Command name "${name}" is not a valid identifier.`;
    });
    if (invalidNameErrors.length > 0) {
        return { errors: invalidNameErrors };
    }

    const unknownNames = [...new Set(selectedCommands ?? [])].filter(name => !names.includes(name)).sort();
    if (unknownNames.length > 0) {
        return {
            errors: [
                `Unknown selected command${unknownNames.length === 1 ? "" : "s"}: ${unknownNames.join(", ")}.`,
                `Valid command names: ${names.join(", ")}.`,
            ],
        };
    }

    const selected = new Set(selectedCommands ?? names);
    const text = [
        `// Generated from ${generatedFrom}. Do not edit.`,
        `// Update with: ${updateCommand}`,
        "",
        "/** Build-time selection for the commands registered by this bundle. */",
        ...names.map(name => `export const ${name} = ${selected.has(name)};`),
        "",
    ].join("\n");
    return { text };
}
