import test from "ava";
import { API } from "typescript/sync";
import { generateCommandNamesModule } from "./codegen.js";
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
