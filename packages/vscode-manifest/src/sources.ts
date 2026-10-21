import { type CallExpression, type Expression, type Node, ScriptKind, SyntaxKind } from "typescript/ast";
import {
    isBinaryExpression,
    isCallExpression,
    isConditionalExpression,
    isIdentifier,
    isNoSubstitutionTemplateLiteral,
    isParenthesizedExpression,
    isPropertyAccessExpression,
    isPropertyAssignment,
    isStringLiteral,
    isVariableDeclaration,
} from "typescript/ast/is";
import type { API } from "typescript/sync";
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

function isStringLiteralLike(node: Node) {
    return isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node);
}

function calleeName(call: CallExpression): string | undefined {
    const callee = call.expression;
    if (isIdentifier(callee)) {
        return callee.text;
    }
    if (isPropertyAccessExpression(callee)) {
        return callee.name.text;
    }
    return undefined;
}

function nameOf(node: Node): string | undefined {
    return isIdentifier(node) || isStringLiteral(node) ? node.text : undefined;
}

/**
 * Finds command registrations and references in one TypeScript source file.
 * Only string literals are understood; ids built at runtime are invisible.
 */
export function scanSource(api: API, file: string, text: string, options: SourceScanOptions): SourceCommands {
    const { commandPrefix } = options;
    const idFactories = new Set(options.idFactories);
    using retained = api.createSourceFile(file, text, { scriptKind: ScriptKind.TS });
    const source = retained.sourceFile;
    const locate = createLocator(file, text);
    const locateNode = (node: Node): Location => locate(node.getStart(source), node.getEnd());

    const registrations: CommandRegistration[] = [];
    const references: IdReference[] = [];

    function visit(node: Node): void {
        if (isCallExpression(node)) {
            const name = calleeName(node);
            const arg = node.arguments[0];
            if (name === "executeCommand" && arg !== undefined) {
                addReferences(arg);
            } else if (name !== undefined && arg !== undefined && isStringLiteralLike(arg)) {
                if (idFactories.has(name)) {
                    registrations.push({ id: commandPrefix + arg.text, location: locateNode(arg), kind: "id-factory" });
                } else if (REGISTER_FUNCTIONS.has(name) && arg.text.startsWith(commandPrefix)) {
                    registrations.push({ id: arg.text, location: locateNode(arg), kind: "register-command" });
                }
            }
        } else if (isPropertyAssignment(node) || isVariableDeclaration(node)) {
            if (node.initializer && nameOf(node.name) === "command") {
                addReferences(node.initializer);
            }
        } else if (isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.EqualsToken) {
            const target = isPropertyAccessExpression(node.left) ? node.left.name : node.left;
            if (nameOf(target) === "command") {
                addReferences(node.right);
            }
        }
        node.forEachChild(visit);
    }

    function addReferences(expression: Expression): void {
        if (isParenthesizedExpression(expression)) {
            addReferences(expression.expression);
        } else if (isConditionalExpression(expression)) {
            addReferences(expression.whenTrue);
            addReferences(expression.whenFalse);
        } else if (isStringLiteralLike(expression) && expression.text.startsWith(commandPrefix)) {
            references.push({ id: expression.text, location: locateNode(expression) });
        }
    }
    visit(source);

    return { registrations, references };
}
