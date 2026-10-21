import { type Expression, type Node, ScriptKind } from "typescript/ast";
import {
    isArrayLiteralExpression,
    isExpressionStatement,
    isObjectLiteralExpression,
    isPropertyAssignment,
    isStringLiteral,
} from "typescript/ast/is";
import type { API } from "typescript/sync";
import { createLocator, type Location } from "./location.js";

export interface JsonProperty {
    readonly key: string;
    readonly keyLocation: Location;
    readonly value: JsonNode;
}

export type JsonNode =
    | { readonly kind: "object"; readonly properties: readonly JsonProperty[]; readonly location: Location }
    | { readonly kind: "array"; readonly items: readonly JsonNode[]; readonly location: Location }
    | { readonly kind: "string"; readonly value: string; readonly location: Location }
    | { readonly kind: "other"; readonly location: Location };

export interface ParseError {
    readonly message: string;
    readonly location: Location;
}

export type JsonParseResult =
    | { readonly root: JsonNode; readonly error?: undefined }
    | { readonly root?: undefined; readonly error: ParseError };

/**
 * Parses strict JSON into a tree that keeps the location of every key and value.
 */
export function parseJson(api: API, file: string, text: string): JsonParseResult {
    const locate = createLocator(file, text);

    try {
        JSON.parse(text);
    } catch (e) {
        return { error: { message: e instanceof Error ? e.message : String(e), location: locate(0, 0) } };
    }

    using retained = api.createSourceFile(file, text, { scriptKind: ScriptKind.JSON });
    const source = retained.sourceFile;
    const locateNode = (node: Node): Location => locate(node.getStart(source), node.getEnd());

    function convert(node: Expression): JsonNode {
        if (isObjectLiteralExpression(node)) {
            const properties: JsonProperty[] = [];
            for (const property of node.properties) {
                if (isPropertyAssignment(property) && isStringLiteral(property.name)) {
                    properties.push({
                        key: property.name.text,
                        keyLocation: locateNode(property.name),
                        value: convert(property.initializer),
                    });
                }
            }
            return { kind: "object", properties, location: locateNode(node) };
        }
        if (isArrayLiteralExpression(node)) {
            return { kind: "array", items: node.elements.map(convert), location: locateNode(node) };
        }
        if (isStringLiteral(node)) {
            return { kind: "string", value: node.text, location: locateNode(node) };
        }
        return { kind: "other", location: locateNode(node) };
    }

    const statement = source.statements[0];
    if (statement === undefined || !isExpressionStatement(statement)) {
        return { error: { message: "Empty document", location: locate(0, 0) } };
    }
    return { root: convert(statement.expression) };
}

export function getProperty(node: JsonNode | undefined, key: string): JsonProperty | undefined {
    if (node?.kind !== "object") {
        return undefined;
    }
    return node.properties.find(p => p.key === key);
}

export function getString(node: JsonNode | undefined, key: string): Extract<JsonNode, { kind: "string" }> | undefined {
    const value = getProperty(node, key)?.value;
    return value?.kind === "string" ? value : undefined;
}

export function getItems(node: JsonNode | undefined): readonly JsonNode[] {
    return node?.kind === "array" ? node.items : [];
}

export function getProperties(node: JsonNode | undefined): readonly JsonProperty[] {
    return node?.kind === "object" ? node.properties : [];
}
