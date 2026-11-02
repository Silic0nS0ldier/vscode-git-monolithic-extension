import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { API } from "typescript/sync";
import { generateCommandNamesModule, generateCommandSelectionModule } from "./codegen.js";
import { parseManifest } from "./manifest.js";

/**
 * Prints the `CommandName` or command-selection module for a manifest to stdout.
 *
 * Usage: generate-command-names --manifest <package.json> --prefix <prefix> --from <label> --update <command>
 *        [--selection [--select <command>]...]
 */
function main(): number {
    const { values } = parseArgs({
        options: {
            manifest: { type: "string" },
            prefix: { type: "string" },
            from: { type: "string" },
            update: { type: "string" },
            selection: { type: "boolean" },
            select: { type: "string", multiple: true },
        },
    });
    const { manifest: file, prefix, from, update, selection, select } = values;
    if (!file || !prefix || !from || !update) {
        console.error(
            "Usage: generate-command-names --manifest <file> --prefix <prefix> --from <label> --update <cmd>",
        );
        return 2;
    }

    using api = new API();
    const parsed = parseManifest(api, file, readFileSync(file, "utf8"));
    if (parsed.error) {
        const { line, column } = parsed.error.location;
        console.error(`${file}:${line}:${column} ${parsed.error.message}`);
        return 1;
    }

    if (!selection && select?.length) {
        console.error("--select requires --selection.");
        return 2;
    }

    const options = {
        commandPrefix: prefix,
        generatedFrom: from,
        updateCommand: update,
    };
    const result = selection
        ? generateCommandSelectionModule(parsed.manifest, { ...options, selectedCommands: select })
        : generateCommandNamesModule(parsed.manifest, options);
    if (result.errors) {
        result.errors.forEach(e => console.error(e));
        return 1;
    }
    process.stdout.write(result.text);
    return 0;
}

process.exitCode = main();
