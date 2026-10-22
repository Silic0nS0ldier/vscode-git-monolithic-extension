import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { API } from "typescript/sync";
import { generateCommandNamesModule } from "./codegen.js";
import { parseManifest } from "./manifest.js";

/**
 * Prints the `CommandName` module for a manifest to stdout.
 *
 * Usage: generate-command-names --manifest <package.json> --prefix <prefix> --from <label> --update <command>
 */
function main(): number {
    const { values } = parseArgs({
        options: {
            manifest: { type: "string" },
            prefix: { type: "string" },
            from: { type: "string" },
            update: { type: "string" },
        },
    });
    const { manifest: file, prefix, from, update } = values;
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

    const result = generateCommandNamesModule(parsed.manifest, {
        commandPrefix: prefix,
        generatedFrom: from,
        updateCommand: update,
    });
    if (result.errors) {
        result.errors.forEach(e => console.error(e));
        return 1;
    }
    process.stdout.write(result.text);
    return 0;
}

process.exitCode = main();
