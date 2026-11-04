import MagicString from "magic-string";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { Plugin } from "rollup";

const PRUNED_MODULE_ID = "\0git-monolithic:pruned-command";

const PRUNED_MODULE_SOURCE = [
    `import { appendFileSync } from "node:fs";`,
    ``,
    `export function pruned(commandId, name) {`,
    `    return {`,
    `        commandId,`,
    `        method: () => {`,
    `            const log = process.env["GIT_MONOLITHIC_ITEST_PRUNED_LOG"];`,
    `            if (log !== undefined) {`,
    `                appendFileSync(log, \`\${name}\\n\`);`,
    `            }`,
    `            // This message is test-only; production bundles never reference pruned commands.`,
    `            throw new Error(\`'\${name}' is not in this build: the integration test suite did not declare it\`);`,
    `        },`,
    `        options: {},`,
    `    };`,
    `}`,
    ``,
].join("\n");

export function commandPruningPlugin(selectionFile: string, implementations: string): Plugin {
    const root = path.resolve(implementations) + path.sep;
    const selection = new Map<string, boolean>();
    const found = new Set<string>();

    return {
        name: "command-pruning",
        async buildStart() {
            selection.clear();
            found.clear();
            this.addWatchFile(path.resolve(selectionFile));
            const source = await readFile(selectionFile, "utf8");
            for (const statement of this.parse(source).body) {
                if (
                    statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration"
                    || statement.declaration.kind !== "const"
                ) this.error(`Invalid command-selection module: ${selectionFile}`);
                for (const declaration of statement.declaration.declarations) {
                    if (
                        declaration.id.type !== "Identifier" || declaration.init?.type !== "Literal"
                        || typeof declaration.init.value !== "boolean" || selection.has(declaration.id.name)
                    ) this.error(`Invalid or duplicate command selection in ${selectionFile}`);
                    selection.set(declaration.id.name, declaration.init.value);
                }
            }
            if (selection.size === 0) this.error(`Empty command-selection module: ${selectionFile}`);
        },
        resolveId(source) {
            if (source === PRUNED_MODULE_ID) return PRUNED_MODULE_ID;
            return null;
        },
        load(id) {
            if (id === PRUNED_MODULE_ID) return PRUNED_MODULE_SOURCE;
            return null;
        },
        transform(code, id) {
            if (!id.startsWith(root) || !id.endsWith(".js")) return null;
            const statements = this.parse(code).body;
            const factories = statements.flatMap(statement =>
                statement.type === "ExportNamedDeclaration"
                    && statement.declaration?.type === "FunctionDeclaration"
                    && statement.declaration.id?.name === "createCommand"
                    ? [statement.declaration]
                    : []
            );
            if (factories.length === 0) return null;
            if (factories.length !== 1) this.error(`Expected one createCommand factory in ${id}`);
            const factory = factories[0]!;
            const commandIds = factory.body.body.flatMap(statement => {
                if (statement.type !== "ReturnStatement" || statement.argument?.type !== "ObjectExpression") return [];
                return statement.argument.properties.flatMap(property => {
                    if (
                        property.type !== "Property" || property.computed || property.key.type !== "Identifier"
                        || property.key.name !== "commandId" || property.value.type !== "CallExpression"
                        || property.value.callee.type !== "Identifier" || property.value.callee.name !== "makeCommandId"
                        || property.value.arguments.length !== 1
                    ) return [];
                    const argument = property.value.arguments[0];
                    return argument?.type === "Literal" && typeof argument.value === "string" ? [argument.value] : [];
                });
            });
            if (commandIds.length !== 1) this.error(`Expected a literal commandId in createCommand in ${id}`);
            const name = commandIds[0]!;
            if (!selection.has(name)) this.error(`Command '${name}' is missing from ${selectionFile}`);
            if (found.has(name)) this.error(`Multiple factories for command '${name}'`);
            found.add(name);
            if (selection.get(name)) return null;
            if (
                !("start" in factory.body) || typeof factory.body.start !== "number"
                || !("end" in factory.body) || typeof factory.body.end !== "number"
            ) this.error(`Missing factory source positions in ${id}`);
            let binding = "__git_monolithic_pruned";
            while (code.includes(binding)) binding += "_";
            const literal = JSON.stringify(name);
            const result = new MagicString(code);
            result.prepend(`import { pruned as ${binding} } from ${JSON.stringify(PRUNED_MODULE_ID)};\n`);
            result.overwrite(
                factory.body.start,
                factory.body.end,
                `{ return ${binding}(makeCommandId(${literal}), ${literal}); }`,
            );
            return { code: result.toString(), map: result.generateMap({ hires: true }) };
        },
        buildEnd(error) {
            if (error) return;
            const missing = [...selection.keys()].filter(name => !found.has(name));
            if (missing.length > 0) this.error(`Command factories not found: ${missing.join(", ")}`);
        },
    };
}
