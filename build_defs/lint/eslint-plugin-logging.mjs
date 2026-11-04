// @ts-check

/**
 * Keeps output channel logging consistent with how VSCode highlights `LogOutputChannel` content (the `log` language,
 * MIME type `text/x-code-log-output`).
 *
 * @see https://github.com/microsoft/vscode/blob/main/extensions/log/syntaxes/log.tmLanguage.json
 */

/** @import { Rule } from "eslint" */
/** @typedef {Parameters<import("eslint").SourceCode["getScope"]>[0]} Node */
/**
 * @template {Node["type"]} T
 * @typedef {Extract<Node, { type: T }>} NodeOf
 */

const LEVEL_METHODS = new Set(["trace", "debug", "info", "warn", "error"]);
const OUTPUT_CHANNEL_NAME = /outputchannel$/i;
const LOGGER_MODULE = /(?:^|\/)tracing\.js$/;

// Patterns from the `log` grammar that colour text as a log level. Inline `(?i)` groups are split into separate
// case-insensitive patterns.
const LEVEL_PATTERNS = [
    /\b(?:[Tt]race|TRACE)\b:?/g,
    /\[(?:verbose|verb|vrb|vb|v)\]/gi,
    /\b(?:DEBUG|Debug)\b/g,
    /\bdebug:/gi,
    /\[(?:debug|dbug|dbg|de|d)\]/gi,
    /\b(?:HINT|INFO|INFORMATION|Info|NOTICE|II)\b/g,
    /\b(?:info|information):/gi,
    /\[(?:information|info|inf|in|i)\]/gi,
    /\b(?:WARNING|WARN|Warn|WW)\b/g,
    /\bwarning:/gi,
    /\[(?:warning|warn|wrn|wn|w)\]/gi,
    /\b(?:ALERT|CRITICAL|EMERGENCY|ERROR|FAILURE|FAIL|Fatal|FATAL|Error|EE)\b/g,
    /\berror:/gi,
    /\[(?:error|eror|err|er|e|fatal|fatl|ftl|fa|f)\]/gi,
];

// The grammar also treats a lone level letter as a level when only whitespace, digits and punctuation precede it on
// the line. The first line of a message follows the timestamp and level, so this only affects continuation lines.
const LINE_START_LEVEL_LETTER = /^[\s\d\p{P}]*\b([VDIWE])\b/u;

/**
 * @param {string} text
 * @returns {{ index: number, keyword: string }[]}
 */
function findLevelKeywords(text) {
    /** @type {{ index: number, keyword: string }[]} */
    const found = [];
    for (const pattern of LEVEL_PATTERNS) {
        for (const match of text.matchAll(pattern)) {
            found.push({ index: match.index, keyword: match[0] });
        }
    }
    found.sort((a, b) => a.index - b.index || b.keyword.length - a.keyword.length);
    // Several patterns can cover the same text (`[WARN]` and `WARN`, `Error:` and `Error`); keep the widest.
    let end = -1;
    return found.filter(({ index, keyword }) => {
        if (index < end) {
            return false;
        }
        end = index + keyword.length;
        return true;
    });
}

/**
 * @param {Node} node
 * @returns {string | undefined}
 */
function receiverName(node) {
    switch (node.type) {
        case "Identifier":
            return node.name;
        case "MemberExpression":
            if (node.property.type === "Identifier" || node.property.type === "PrivateIdentifier") {
                return node.property.name;
            }
            return undefined;
        default:
            return undefined;
    }
}

/**
 * @param {Rule.RuleContext} context
 * @param {NodeOf<"Identifier">} identifier
 * @returns {NodeOf<"ImportDeclaration"> | undefined}
 */
function findImportDeclaration(context, identifier) {
    let scope = context.sourceCode.getScope(identifier);
    while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
            const def = variable.defs[0];
            return def?.type === "ImportBinding" && def.parent.type === "ImportDeclaration" ? def.parent : undefined;
        }
        if (!scope.upper) {
            return undefined;
        }
        scope = scope.upper;
    }
    return undefined;
}

/**
 * @param {Rule.RuleContext} context
 * @param {NodeOf<"Identifier">} identifier
 */
function isImportedFromLogger(context, identifier) {
    const declaration = findImportDeclaration(context, identifier);
    return typeof declaration?.source.value === "string" && LOGGER_MODULE.test(declaration.source.value);
}

/**
 * Whether the call logs at a level, through either the `tracing.js` helpers or a `LogOutputChannel` method.
 *
 * @param {Rule.RuleContext} context
 * @param {NodeOf<"CallExpression">} node
 */
function isLevelLogCall(context, node) {
    const callee = node.callee;
    if (callee.type === "Identifier") {
        return LEVEL_METHODS.has(callee.name) && isImportedFromLogger(context, callee);
    }
    if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") {
        return false;
    }
    if (!LEVEL_METHODS.has(callee.property.name)) {
        return false;
    }
    if (callee.object.type === "Identifier" && isImportedFromLogger(context, callee.object)) {
        return true;
    }
    const name = receiverName(callee.object);
    return name !== undefined && OUTPUT_CHANNEL_NAME.test(name);
}

/**
 * Static text of a message, in order. `undefined` stands for a dynamic part.
 *
 * @typedef {{ text: string, node: Node } | undefined} MessagePart
 */

/**
 * @param {Node} node
 * @returns {MessagePart[]}
 */
function messageParts(node) {
    if (node.type === "Literal" && typeof node.value === "string") {
        return [{ text: node.value, node }];
    }
    if (node.type === "TemplateLiteral") {
        /** @type {MessagePart[]} */
        const parts = [];
        node.quasis.forEach((quasi, i) => {
            if (i > 0) {
                parts.push(undefined);
            }
            // `cooked` is null only for tagged templates with invalid escapes.
            parts.push({ text: quasi.value.cooked ?? quasi.value.raw, node: quasi });
        });
        return parts;
    }
    if (node.type === "BinaryExpression" && node.operator === "+" && node.left.type !== "PrivateIdentifier") {
        return [...messageParts(node.left), ...messageParts(node.right)];
    }
    return [undefined];
}

/** @type {Rule.RuleModule} */
const noOutputChannelAppend = {
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Disallow writing raw lines to output channels; log through `tracing.js` so every line has a timestamp and level and respects the log level.",
        },
        schema: [],
        messages: {
            noAppend:
                "Use `trace`, `debug`, `info`, `warn` or `error` from `tracing.ts` instead of `{{method}}`; raw lines have no timestamp or level and ignore the log level.",
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") {
                    return;
                }
                const method = callee.property.name;
                const name = receiverName(callee.object);
                if (method === "appendLine" || (method === "append" && name && OUTPUT_CHANNEL_NAME.test(name))) {
                    context.report({ node: callee.property, messageId: "noAppend", data: { method } });
                }
            },
        };
    },
};

/** @type {Rule.RuleModule} */
const messageContent = {
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Keep log message text from being highlighted as a log level by the Output view's `log` grammar.",
        },
        schema: [],
        messages: {
            redundantLevel:
                "Remove the \"{{keyword}}\" prefix; the log level is added by the method called (`trace`, `debug`, `info`, `warn`, `error`).",
            levelKeyword: "\"{{keyword}}\" is highlighted as a log level in the Output view; reword the message.",
            levelLetter:
                "A line starting with a lone \"{{keyword}}\" is highlighted as a log level in the Output view; reword or indent with a non-punctuation prefix.",
        },
    },
    create(context) {
        return {
            CallExpression(node) {
                const message = node.arguments[0];
                if (!message || message.type === "SpreadElement" || !isLevelLogCall(context, node)) {
                    return;
                }

                let atMessageStart = true;
                let atLineStart = false;
                for (const part of messageParts(message)) {
                    if (part === undefined) {
                        atMessageStart = false;
                        atLineStart = false;
                        continue;
                    }

                    const keywords = findLevelKeywords(part.text);
                    const leading = part.text.length - part.text.trimStart().length;
                    for (const { index, keyword } of keywords) {
                        const isPrefix = atMessageStart && index === leading
                            && (keyword.startsWith("[") || keyword.endsWith(":")
                                || part.text[index + keyword.length] === ":");
                        const messageId = isPrefix ? "redundantLevel" : "levelKeyword";
                        context.report({ node: part.node, messageId, data: { keyword } });
                    }

                    const lines = part.text.split("\n");
                    lines.forEach((line, i) => {
                        if (i === 0 && !atLineStart) {
                            return;
                        }
                        const letter = LINE_START_LEVEL_LETTER.exec(line);
                        if (letter) {
                            context.report({ node: part.node, messageId: "levelLetter", data: { keyword: letter[1] } });
                        }
                    });

                    if (part.text.length > 0) {
                        atMessageStart = false;
                        atLineStart = part.text.endsWith("\n");
                    }
                }
            },
        };
    },
};

export default {
    meta: { name: "logging" },
    rules: {
        "message-content": messageContent,
        "no-output-channel-append": noOutputChannelAppend,
    },
};
