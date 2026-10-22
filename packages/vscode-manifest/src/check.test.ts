import test from "ava";
import { checkProject, type DiagnosticCode, formatDiagnostic } from "./check.js";

const options = { commandPrefix: "ext.", idFactories: ["makeCommandId"] };

function run(manifest: object, nls: object, ...sources: string[]): [DiagnosticCode, string][] {
    return checkProject({
        manifest: { file: "package.json", text: JSON.stringify(manifest, null, 4) },
        nls: { file: "package.nls.json", text: JSON.stringify(nls, null, 4) },
        sources: sources.map((text, i) => ({ file: `src/${i}.ts`, text })),
        options,
    }).map(d => [d.code, d.subject]);
}

const command = (id: string) => ({ command: id, title: `%${id}%` });
const nlsFor = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, id]));

test("Reports nothing when declarations, registrations and strings agree", t => {
    const manifest = {
        contributes: {
            commands: [command("ext.a"), command("ext.b")],
            menus: { commandPalette: [{ command: "ext.b", when: "false" }], "scm/title": [{ command: "ext.b" }] },
        },
    };
    t.deepEqual(run(manifest, nlsFor("ext.a", "ext.b"), `makeCommandId("a"); makeCommandId("b");`), []);
});

test("Reports a declared command that is never registered", t => {
    const manifest = { contributes: { commands: [command("ext.a")] } };
    t.deepEqual(run(manifest, nlsFor("ext.a")), [["unimplemented-command", "ext.a"]]);
});

test("Reports a registered command that nothing can run", t => {
    t.deepEqual(run({}, {}, `makeCommandId("internal");`), [["unreachable-command", "ext.internal"]]);
});

test("Reports a declared command that is hidden from the palette and in no menu", t => {
    const manifest = {
        contributes: {
            commands: [command("ext.a")],
            menus: { commandPalette: [{ command: "ext.a", when: "false" }] },
        },
    };
    t.deepEqual(run(manifest, nlsFor("ext.a"), `makeCommandId("a");`), [["unreachable-command", "ext.a"]]);
});

test("Treats keybindings, alt menu commands and code references as reachable", t => {
    const manifest = {
        contributes: {
            keybindings: [{ command: "ext.key", key: "ctrl+k" }],
            menus: { "scm/title": [{ command: "ext.missing", alt: "ext.alt" }] },
        },
    };
    const source = `
        makeCommandId("key"); makeCommandId("alt"); makeCommandId("exec"); makeCommandId("prop");
        makeCommandId("assigned"); makeCommandId("ternaryA"); makeCommandId("ternaryB");
        commands.executeCommand("ext.exec");
        const item = { command: "ext.prop" };
        item.command = "ext.assigned";
        let command = flag ? "ext.ternaryA" : ("ext.ternaryB");
    `;
    t.deepEqual(run(manifest, {}, source), [["unknown-command", "ext.missing"]]);
});

test("Recognises registerCommand with a full id", t => {
    const manifest = { contributes: { commands: [command("ext.a")] } };
    t.deepEqual(run(manifest, nlsFor("ext.a"), `commands.registerCommand("ext.a", () => {});`), []);
});

test("Counts id-factory calls used as command values as references, not registrations", t => {
    const source = `
        commands.registerCommand(makeCommandId("internal"), () => {});
        commands.executeCommand(makeCommandId("internal"));
        const item = { command: flag ? makeCommandId("internal") : makeCommandId("missing") };
    `;
    t.deepEqual(run({}, {}, source), [["unknown-command", "ext.missing"]]);
});

test("Ignores ids outside the command prefix", t => {
    const source = `commands.executeCommand("vscode.open"); commands.executeCommand("setContext", "ext.ctx", 1);`;
    t.deepEqual(run({}, {}, source), []);
});

test("Reports references to commands that do not exist", t => {
    const manifest = {
        contributes: {
            menus: { commandPalette: [{ command: "ext.palette" }] },
            keybindings: [{ command: "ext.key" }],
        },
    };
    t.deepEqual(run(manifest, {}, `executeCommand("ext.code");`), [
        ["unknown-command", "ext.palette"],
        ["unknown-command", "ext.key"],
        ["unknown-command", "ext.code"],
    ]);
});

test("Reports duplicate declarations and registrations", t => {
    const manifest = { contributes: { commands: [command("ext.a"), command("ext.a")] } };
    t.deepEqual(run(manifest, nlsFor("ext.a"), `makeCommandId("a");`, `makeCommandId("a");`), [
        ["duplicate-command", "ext.a"],
        ["duplicate-command", "ext.a"],
    ]);
});

test("Reports unknown and unused submenus", t => {
    const manifest = {
        contributes: {
            submenus: [{ id: "ext.used", label: "Used" }, { id: "ext.unused", label: "Unused" }],
            menus: { "scm/title": [{ submenu: "ext.used" }, { submenu: "ext.unknown" }] },
        },
    };
    t.deepEqual(run(manifest, {}), [["unused-submenu", "ext.unused"], ["unknown-submenu", "ext.unknown"]]);
});

test("Reports missing and unused nls keys anywhere in the manifest", t => {
    const manifest = { displayName: "%name%", contributes: { configuration: { title: "%config%" } } };
    t.deepEqual(run(manifest, { name: "Name", stale: "Stale" }), [
        ["missing-nls-key", "config"],
        ["unused-nls-key", "stale"],
    ]);
});

test("Reports unparsable files instead of throwing", t => {
    const diagnostics = checkProject({
        manifest: { file: "package.json", text: "{" },
        nls: { file: "package.nls.json", text: "{}" },
        sources: [],
        options,
    });
    t.deepEqual(diagnostics.map(d => [d.code, d.subject]), [["parse-error", "package.json"]]);
});

test("Locates diagnostics by line and column", t => {
    const [diagnostic] = checkProject({
        manifest: {
            file: "package.json",
            text: `{\n    "contributes": {\n        "commands": [{ "command": "ext.a" }]\n    }\n}`,
        },
        nls: { file: "package.nls.json", text: "{}" },
        sources: [],
        options,
    });
    t.is(
        formatDiagnostic(diagnostic!),
        `package.json:3:35 unimplemented-command: Command "ext.a" is declared but never registered.`,
    );
});
