import ts from "typescript";
import { createLocator, type Location } from "./location.js";
import type { IdReference } from "./manifest.js";

export interface SourceScanOptions {
    /** Prefix shared by the extension's command ids, e.g. `git_monolithic.`. Other ids are not tracked. */
    readonly commandPrefix: string;
    /**
     * Functions whose string-literal argument, prefixed with `commandPrefix`, is a command id that gets registered.
     * e.g. `makeCommandId("stage")` registers `git_monolithic.stage`.
     */
    readonly idFactories?: readonly string[];
}

export type RegistrationKind = "id-factory" | "register-command";

export interface CommandRegistration extends IdReference {
    readonly kind: RegistrationKind;
}

export interface SourceCommands {
    readonly registrations: readonly CommandRegistration[];
    /**
     * `executeCommand("…")` calls, and values given to anything named `command` (status bar items, `Command`
     * objects, etc.), including both branches of a conditional.
     */
    readonly references: readonly IdReference[];
}

const REGISTER_FUNCTIONS = new Set(["registerCommand", "registerTextEditorCommand"]);

function calleeName(call: ts.CallExpression): string | undefined {
    const callee = call.expression;
    if (ts.isIdentifier(callee)) {
        return callee.text;
    }
    if (ts.isPropertyAccessExpression(callee)) {
        return callee.name.text;
    }
    return undefined;
}

function nameOf(node: ts.Node): string | undefined {
    return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

/**
 * Finds command registrations and references in one TypeScript source file.
 * Only string literals are understood; ids built at runtime are invisible.
 */
export function scanSource(file: string, text: string, options: SourceScanOptions): SourceCommands {
    const { commandPrefix } = options;
    const idFactories = new Set(options.idFactories);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const locate = createLocator(file, text);
    const locateNode = (node: ts.Node): Location => locate(node.getStart(source), node.getEnd());

    const registrations: CommandRegistration[] = [];
    const references: IdReference[] = [];

    function visit(node: ts.Node): void {
        if (ts.isCallExpression(node)) {
            const name = calleeName(node);
            const arg = node.arguments[0];
            if (name === "executeCommand" && arg !== undefined) {
                addReferences(arg);
            } else if (name !== undefined && arg !== undefined && ts.isStringLiteralLike(arg)) {
                if (idFactories.has(name)) {
                    registrations.push({ id: commandPrefix + arg.text, location: locateNode(arg), kind: "id-factory" });
                } else if (REGISTER_FUNCTIONS.has(name) && arg.text.startsWith(commandPrefix)) {
                    registrations.push({ id: arg.text, location: locateNode(arg), kind: "register-command" });
                }
            }
        } else if (ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node)) {
            if (node.initializer && nameOf(node.name) === "command") {
                addReferences(node.initializer);
            }
        } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            const target = ts.isPropertyAccessExpression(node.left) ? node.left.name : node.left;
            if (nameOf(target) === "command") {
                addReferences(node.right);
            }
        }
        ts.forEachChild(node, visit);
    }

    function addReferences(expression: ts.Expression): void {
        if (ts.isParenthesizedExpression(expression)) {
            addReferences(expression.expression);
        } else if (ts.isConditionalExpression(expression)) {
            addReferences(expression.whenTrue);
            addReferences(expression.whenFalse);
        } else if (ts.isStringLiteralLike(expression) && expression.text.startsWith(commandPrefix)) {
            references.push({ id: expression.text, location: locateNode(expression) });
        }
    }
    visit(source);

    return { registrations, references };
}
