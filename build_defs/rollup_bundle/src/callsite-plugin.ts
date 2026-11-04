import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { type AttachedScope, attachScopes } from "@rollup/pluginutils";
import type * as estree from "estree";
import MagicString from "magic-string";
import * as path from "node:path";
import type { Plugin, TransformPluginContext } from "rollup";
import { repositoryPath } from "./repository-path.js";

const SCOPE = "__callsiteScope";
const BINDING_PREFIX = "__git_monolithic_callsite";
// Keeps call-site names (see `extension/src/tracing.ts`) unambiguous and matchable by `.*`: no line terminators, and
// no `:` or `@`, which separate the file from what follows it.
const CALLSITE_FILE = /^[A-Za-z0-9._/-]+$/;

type Node = estree.Node & { start: number; end: number; [SCOPE]?: AttachedScope };

/**
 * Passes each call to a logger function its call site: a static `{ file, line, column }` object, declared once per
 * call at the top of the calling module and added as an extra final argument. `file` is the repository-relative path
 * of the original source, and `line` and `column` are 1-based positions in it, found through the incoming source maps.
 * `file` may only contain ASCII letters, digits, `.`, `_`, `/` and `-`; any other character fails the build.
 *
 * Logger functions must be imported by name and only ever called directly, with exactly the one argument written in
 * source; any other use would silently go without a call site, so it fails the build.
 */
export function callsitePlugin(loggerModule: string, functions: readonly string[]): Plugin {
    const loggerId = path.resolve(loggerModule);
    const loggerName = path.parse(loggerId).name;
    const functionNames = new Set(functions);
    let loggerFound = false;

    return {
        name: "callsite",
        buildStart() {
            loggerFound = false;
        },
        async transform(code, id) {
            if (id === loggerId) {
                loggerFound = true;
                return null;
            }
            if (!code.includes(loggerName)) return null;
            const ast = this.parse(code) as estree.Program & Node;
            const bindings = await loggerBindings(this, ast, id, loggerId, functionNames);
            if (bindings.size === 0) return null;

            const calls: Node[] = [];
            const root = attachScopes(ast, SCOPE);
            walk(ast, null, root, (node, parent, scope) => {
                if (node.type !== "Identifier" || !bindings.has(node.name) || !isReference(node, parent)) return;
                if (isShadowed(node.name, scope, root)) return;
                if (parent?.type !== "CallExpression" || parent.callee !== node) {
                    this.error(
                        `'${node.name}' from ${loggerModule} must be called directly, so its call site can be passed`,
                        node.start,
                    );
                }
                if (parent.arguments.length !== 1 || parent.arguments[0]!.type === "SpreadElement") {
                    this.error(
                        `'${node.name}' from ${loggerModule} must be called with exactly one argument; its call site is passed as another`,
                        node.start,
                    );
                }
                calls.push(parent as Node);
            });
            if (calls.length === 0) return null;

            if (code.includes(BINDING_PREFIX)) this.error(`'${BINDING_PREFIX}' is reserved for call sites`);
            const { mappings, names, sources } = this.getCombinedSourcemap();
            const trace = new TraceMap({ version: 3, mappings, names, sources });
            const lineStarts = [0];
            for (let i = code.indexOf("\n"); i !== -1; i = code.indexOf("\n", i + 1)) lineStarts.push(i + 1);

            const result = new MagicString(code);
            const declarations = calls.map((call, index) => {
                const binding = `${BINDING_PREFIX}${index}`;
                const argument = (call as estree.CallExpression & Node).arguments[0] as Node;
                result.appendLeft(argument.end, `, ${binding}`);
                const line = upperBound(lineStarts, call.start);
                const original = originalPositionFor(trace, { line, column: call.start - lineStarts[line - 1]! });
                if (original.source === null) this.error(`No source mapping for log call`, call.start);
                const file = repositoryPath(path.resolve(path.dirname(id), original.source));
                if (!CALLSITE_FILE.test(file)) {
                    this.error(
                        `Log call source path ${JSON.stringify(file)} has characters outside ${CALLSITE_FILE.source}`,
                        call.start,
                    );
                }
                const callsite = `{ file: ${JSON.stringify(file)}, line: ${original.line}, column: ${
                    original.column + 1
                } }`;
                return `const ${binding} = ${callsite};\n`;
            });
            // Imports are hoisted, so declaring the call sites first leaves them initialised before any code runs.
            const insertAt = code.startsWith("#!") ? lineStarts[1] ?? code.length : 0;
            result.prependRight(insertAt, declarations.join(""));
            return { code: result.toString(), map: result.generateMap({ hires: true }) };
        },
        buildEnd(error) {
            if (error) return;
            if (!loggerFound) this.error(`Logger module '${loggerId}' is not part of the bundle`);
        },
    };
}

/** Local names of the logger functions imported by a module. */
async function loggerBindings(
    context: TransformPluginContext,
    ast: estree.Program,
    id: string,
    loggerId: string,
    functionNames: ReadonlySet<string>,
): Promise<Set<string>> {
    const bindings = new Set<string>();
    for (const statement of ast.body as Node[]) {
        if (
            statement.type !== "ImportDeclaration" && statement.type !== "ExportNamedDeclaration"
            && statement.type !== "ExportAllDeclaration"
        ) continue;
        if (typeof statement.source?.value !== "string") continue;
        const resolved = await context.resolve(statement.source.value, id);
        if (resolved?.id !== loggerId) continue;
        if (statement.type === "ImportDeclaration") {
            for (const specifier of statement.specifiers) {
                if (specifier.type !== "ImportSpecifier") {
                    context.error(
                        "Logger functions must be imported by name, so their call sites can be passed",
                        statement.start,
                    );
                }
                const name = moduleExportName(specifier.imported);
                if (name !== undefined && functionNames.has(name)) bindings.add(specifier.local.name);
            }
        } else if (
            statement.type === "ExportAllDeclaration"
            || statement.specifiers.some(specifier => functionNames.has(moduleExportName(specifier.local) ?? ""))
        ) {
            context.error(
                "Logger functions must not be re-exported, so their call sites can be passed",
                statement.start,
            );
        }
    }
    return bindings;
}

function moduleExportName(node: estree.Identifier | estree.Literal): string | undefined {
    return node.type === "Identifier" ? node.name : typeof node.value === "string" ? node.value : undefined;
}

function walk(
    node: Node,
    parent: Node | null,
    scope: AttachedScope,
    visit: (node: Node, parent: Node | null, scope: AttachedScope) => void,
): void {
    visit(node, parent, scope);
    const innerScope = node[SCOPE] ?? scope;
    for (const [key, value] of Object.entries(node)) {
        if (key === SCOPE) continue;
        for (const child of Array.isArray(value) ? value : [value]) {
            if (typeof child === "object" && child !== null && typeof child.type === "string") {
                walk(child as Node, node, innerScope, visit);
            }
        }
    }
}

/** Whether a scope below the module scope declares the name, hiding the import. */
function isShadowed(name: string, scope: AttachedScope, root: AttachedScope): boolean {
    for (let current: AttachedScope | undefined = scope; current && current !== root; current = current.parent) {
        if (current.declarations[name]) return true;
    }
    return false;
}

/** Whether an identifier refers to a binding, rather than naming a property, label or declaration. */
function isReference(node: Node, parent: Node | null): boolean {
    switch (parent?.type) {
        case undefined:
            return true;
        case "MemberExpression":
            return parent.computed || node === parent.object;
        case "Property":
            return node === parent.value || (parent.computed && node === parent.key);
        case "MethodDefinition":
        case "PropertyDefinition":
            return (parent.computed && node === parent.key) || node === parent.value;
        case "ExportSpecifier":
            return node === parent.local;
        case "ImportSpecifier":
        case "ImportDefaultSpecifier":
        case "ImportNamespaceSpecifier":
        case "LabeledStatement":
        case "BreakStatement":
        case "ContinueStatement":
        case "MetaProperty":
            return false;
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ClassDeclaration":
        case "ClassExpression":
            return node !== parent.id;
        default:
            return true;
    }
}

/** 1-based index of the last line starting at or before `offset`. */
function upperBound(lineStarts: readonly number[], offset: number): number {
    let low = 0;
    let high = lineStarts.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (lineStarts[middle]! <= offset) low = middle + 1;
        else high = middle;
    }
    return low;
}
