import test from "ava";
import { API } from "typescript/sync";
import { generateCommandNamesModule, generateCommandSelectionModule } from "./codegen.js";
import { parseManifest } from "./manifest.js";

const options = { commandPrefix: "ext.", generatedFrom: "package.json", updateCommand: "update" };

function generate(commands: string[]) {
    using api = new API();
    const text = JSON.stringify({ contributes: { commands: commands.map(command => ({ command })) } }, null, 4);
    const parsed = parseManifest(api, "package.json", text);
    if (parsed.error) {
        throw new Error(parsed.error.message);
    }
    return generateCommandNamesModule(parsed.manifest, options);
}

function generateSelection(commands: string[], selectedCommands?: string[]) {
    using api = new API();
    const text = JSON.stringify({ contributes: { commands: commands.map(command => ({ command })) } }, null, 4);
    const parsed = parseManifest(api, "package.json", text);
    if (parsed.error) {
        throw new Error(parsed.error.message);
    }
    return generateCommandSelectionModule(parsed.manifest, { ...options, selectedCommands });
}

test("Generates a sorted, deduplicated union of command names without the prefix", t => {
    t.is(
        generate(["ext.b", "ext.a", "ext.b"]).text,
        [
            "// Generated from package.json. Do not edit.",
            "// Update with: update",
            "",
            "/** Command ids declared in the manifest, without their prefix. */",
            "export type CommandName =",
            `    | "a"`,
            `    | "b";`,
            "",
        ].join("\n"),
    );
});

test("Generates never when no commands are declared", t => {
    t.regex(generate([]).text!, /^export type CommandName = never;$/m);
});

test("Rejects commands outside the prefix", t => {
    t.deepEqual(generate(["ext.a", "other.b"]).errors, [
        `package.json:8:28 Command "other.b" does not start with "ext.".`,
    ]);
});

test("Generates all command-selection constants as true by default", t => {
    t.is(
        generateSelection(["ext.b", "ext.a", "ext.b"]).text,
        [
            "// Generated from package.json. Do not edit.",
            "// Update with: update",
            "",
            "/** Build-time selection for the commands registered by this bundle. */",
            "export const a = true;",
            "export const b = true;",
            "",
        ].join("\n"),
    );
});

test("Generates only the selected command as true", t => {
    t.is(
        generateSelection(["ext.b", "ext.a"], ["b"]).text,
        [
            "// Generated from package.json. Do not edit.",
            "// Update with: update",
            "",
            "/** Build-time selection for the commands registered by this bundle. */",
            "export const a = false;",
            "export const b = true;",
            "",
        ].join("\n"),
    );
});

test("Rejects unknown selected commands and lists valid commands", t => {
    t.deepEqual(generateSelection(["ext.a"], ["missing"]).errors, [
        "Unknown selected command: missing.",
        "Valid command names: a.",
    ]);
});

test("Rejects command names that are not identifiers", t => {
    t.deepEqual(generateSelection(["ext.not-valid"]).errors, [
        `package.json:5:28 Command name "not-valid" is not a valid identifier.`,
    ]);
});

test("Rejects reserved words as command names", t => {
    t.deepEqual(generateSelection(["ext.default"]).errors, [
        `package.json:5:28 Command name "default" is not a valid identifier.`,
    ]);
});
